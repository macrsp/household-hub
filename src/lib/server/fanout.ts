/// <reference types="@cloudflare/workers-types" />
//
// Fanout: given one new canonical message, deliver a copy to every other
// participant through each of their endpoints, recording one `deliveries`
// row per attempt. This is the reusable hub helper — every transport's
// inbound path (app POST, SMS webhook, later email) calls fanoutMessage()
// after it has stored the canonical message.

import { insertDelivery, updateDeliveryStatus, type DeliveryRow } from './db';
import { sendSms } from './sms';
import { nowIso } from './time';

type Env = App.Platform['env'];

interface EndpointRow {
	id: string;
	person_id: string;
	type: string;
	address: string;
}

/**
 * Deliver message `messageId` to every other participant of its conversation.
 *
 * Author and muted participants are skipped. For each remaining recipient
 * endpoint that has a transport adapter, a `deliveries` row is written before
 * the send and updated with the outcome after. Each send runs in its own
 * try/catch so one failure cannot abort the rest (see .agent/PLANS.md
 * User-Asset Durability) — the deliveries row IS the durable outcome record.
 */
export async function fanoutMessage(
	db: D1Database,
	env: Env,
	messageId: string
): Promise<void> {
	const message = await db
		.prepare('SELECT id, conversation_id, author_person_id, body FROM messages WHERE id = ?')
		.bind(messageId)
		.first<{ id: string; conversation_id: string; author_person_id: string; body: string }>();
	if (!message) return;

	const author = await db
		.prepare('SELECT display_name FROM people WHERE id = ?')
		.bind(message.author_person_id)
		.first<{ display_name: string }>();
	const authorName = author?.display_name ?? 'Unknown';

	// Recipients: conversation participants, minus the author, minus muted.
	const { results: recipients } = await db
		.prepare(
			`SELECT person_id FROM participants
			 WHERE conversation_id = ? AND person_id != ? AND muted = 0`
		)
		.bind(message.conversation_id, message.author_person_id)
		.all<{ person_id: string }>();

	for (const recipient of recipients) {
		const { results: endpoints } = await db
			.prepare('SELECT id, person_id, type, address FROM endpoints WHERE person_id = ?')
			.bind(recipient.person_id)
			.all<EndpointRow>();

		for (const endpoint of endpoints) {
			// v1 has exactly one outbound adapter: SMS. `email` and `app`
			// endpoint types are stored for the future but have no push
			// transport yet (the web app reads by polling), so they get no
			// delivery row — every `deliveries` row is a real send attempt.
			if (endpoint.type !== 'sms') continue;

			const deliveryId = crypto.randomUUID();
			const ts = nowIso();
			const delivery: DeliveryRow = {
				id: deliveryId,
				message_id: message.id,
				endpoint_id: endpoint.id,
				transport: 'sms',
				provider_message_id: null,
				status: 'pending',
				error: null,
				created_at: ts,
				updated_at: ts
			};
			await insertDelivery(db, delivery);

			try {
				const result = await sendSms(
					env,
					endpoint.address,
					`[${authorName}]: ${message.body}`
				);
				if (result.kind === 'sent') {
					await updateDeliveryStatus(db, deliveryId, 'sent', {
						provider_message_id: result.providerMessageId ?? undefined
					});
				} else if (result.kind === 'stubbed') {
					await updateDeliveryStatus(db, deliveryId, 'sent_stubbed');
				} else {
					await updateDeliveryStatus(db, deliveryId, 'failed', { error: result.error });
				}
			} catch (e) {
				// Not a silent fallback: the failure is recorded on the
				// delivery row, which is the durable outcome record. The
				// per-iteration scope keeps one failure from aborting the rest.
				await updateDeliveryStatus(db, deliveryId, 'failed', {
					error: e instanceof Error ? e.message : String(e)
				});
			}
		}
	}
}
