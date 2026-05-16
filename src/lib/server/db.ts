/// <reference types="@cloudflare/workers-types" />
//
// Thin, typed helpers over Cloudflare D1. These are the only functions
// permitted to INSERT/UPDATE the user-asset tables `messages` and `deliveries`
// at runtime. Route handlers and the fanout helper call these; nothing here
// imports route code.

import { nowIso } from './time';

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
