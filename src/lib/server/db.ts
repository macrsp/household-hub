/// <reference types="@cloudflare/workers-types" />
//
// Thin, typed helpers over Cloudflare D1. These are the only functions
// permitted to INSERT/UPDATE the user-asset tables `messages` and `deliveries`
// at runtime. Route handlers and the fanout helper call these; nothing here
// imports route code.

import { nowIso } from './time';
import type { DeliveryPreference } from '../preferences';

// Single source of truth for the transport string sets. The schema CHECK
// constraints in migrations/0001_initial.sql mirror these — keep them in sync
// (see migrations/README.md). fanout.test.ts enumerates these arrays.
export const ENDPOINT_TYPES = ['sms', 'email', 'app'] as const;
export const SOURCE_TRANSPORTS = ['app', 'sms', 'email', 'system'] as const;
export const DELIVERY_TRANSPORTS = ['sms', 'email', 'app'] as const;

export type EndpointType = (typeof ENDPOINT_TYPES)[number];
export type SourceTransport = (typeof SOURCE_TRANSPORTS)[number];
export type DeliveryTransport = (typeof DELIVERY_TRANSPORTS)[number];

export interface Message {
	id: string;
	conversation_id: string;
	author_person_id: string;
	body: string;
	source_transport: SourceTransport;
	created_at: string;
	// Soft-deletion (M22): NULL while live, an ISO 8601 string once the author
	// retracts the message. The row is never DELETEd. Omitted on insert — a new
	// message is always live, which the schema default (NULL) already gives.
	deleted_at?: string | null;
}

export interface DeliveryRow {
	id: string;
	message_id: string;
	endpoint_id: string;
	transport: DeliveryTransport;
	provider_message_id: string | null;
	status: string;
	error: string | null;
	created_at: string;
	updated_at: string;
}

/** Insert one canonical message. */
export async function insertMessage(db: D1Database, m: Message): Promise<void> {
	await db
		.prepare(
			`INSERT INTO messages (id, conversation_id, author_person_id, body, source_transport, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(m.id, m.conversation_id, m.author_person_id, m.body, m.source_transport, m.created_at)
		.run();
}

/**
 * Soft-delete a message: stamp `deleted_at`, never remove the row. The author
 * id is part of the WHERE clause, so only the message's own author can delete
 * it, and `deleted_at IS NULL` makes a repeat delete a no-op. Returns true if
 * exactly this UPDATE flipped a live message to deleted — the caller has
 * already confirmed the message exists and the caller is its author, so a
 * false return means the message was already deleted.
 */
export async function softDeleteMessage(
	db: D1Database,
	messageId: string,
	authorPersonId: string
): Promise<boolean> {
	const res = await db
		.prepare(
			`UPDATE messages SET deleted_at = ?
			 WHERE id = ? AND author_person_id = ? AND deleted_at IS NULL`
		)
		.bind(nowIso(), messageId, authorPersonId)
		.run();
	return (res.meta.changes ?? 0) > 0;
}

/** Insert one delivery attempt row (typically with status 'pending'). */
export async function insertDelivery(db: D1Database, d: DeliveryRow): Promise<void> {
	await db
		.prepare(
			`INSERT INTO deliveries
			 (id, message_id, endpoint_id, transport, provider_message_id, status, error, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			d.id,
			d.message_id,
			d.endpoint_id,
			d.transport,
			d.provider_message_id,
			d.status,
			d.error,
			d.created_at,
			d.updated_at
		)
		.run();
}

/** Update a delivery row's status (and optionally provider id / error text). */
export async function updateDeliveryStatus(
	db: D1Database,
	id: string,
	status: string,
	fields: { provider_message_id?: string; error?: string } = {}
): Promise<void> {
	await db
		.prepare(
			`UPDATE deliveries SET status = ?, provider_message_id = ?, error = ?, updated_at = ?
			 WHERE id = ?`
		)
		.bind(status, fields.provider_message_id ?? null, fields.error ?? null, nowIso(), id)
		.run();
}

/** Update a participant's notification preferences for one conversation. */
export async function updateParticipantPrefs(
	db: D1Database,
	conversationId: string,
	personId: string,
	prefs: { muted?: boolean; delivery_preference?: DeliveryPreference }
): Promise<void> {
	const sets: string[] = [];
	const binds: Array<string | number> = [];
	if (prefs.muted !== undefined) {
		sets.push('muted = ?');
		binds.push(prefs.muted ? 1 : 0);
	}
	if (prefs.delivery_preference !== undefined) {
		sets.push('delivery_preference = ?');
		binds.push(prefs.delivery_preference);
	}
	if (sets.length === 0) return;
	binds.push(conversationId, personId);
	await db
		.prepare(
			`UPDATE participants SET ${sets.join(', ')} WHERE conversation_id = ? AND person_id = ?`
		)
		.bind(...binds)
		.run();
}

/**
 * Update a delivery row's status by its provider message id — used by the
 * Twilio delivery-status callback. `error` is written only when provided
 * (COALESCE keeps any existing error otherwise).
 */
export async function updateDeliveryByProviderId(
	db: D1Database,
	providerMessageId: string,
	status: string,
	fields: { error?: string } = {}
): Promise<void> {
	await db
		.prepare(
			`UPDATE deliveries SET status = ?, error = COALESCE(?, error), updated_at = ?
			 WHERE provider_message_id = ?`
		)
		.bind(status, fields.error ?? null, nowIso(), providerMessageId)
		.run();
}

/**
 * Create a conversation and add the given people as its participants, in one
 * atomic D1 batch — so a conversation never exists with a partial set of
 * participants. The only runtime write path to `conversations` and
 * `participants`.
 */
export async function createConversationWithParticipants(
	db: D1Database,
	conversation: { id: string; name: string; slug: string; created_at: string },
	personIds: string[]
): Promise<void> {
	const statements = [
		db
			.prepare('INSERT INTO conversations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
			.bind(conversation.id, conversation.name, conversation.slug, conversation.created_at),
		...personIds.map((personId) =>
			db
				.prepare(
					`INSERT OR IGNORE INTO participants
					 (conversation_id, person_id, delivery_preference, muted)
					 VALUES (?, ?, 'all', 0)`
				)
				.bind(conversation.id, personId)
		)
	];
	await db.batch(statements);
}
