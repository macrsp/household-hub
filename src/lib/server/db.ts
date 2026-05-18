/// <reference types="@cloudflare/workers-types" />
//
// Thin, typed helpers over Cloudflare D1. These are the only functions
// permitted to INSERT/UPDATE the user-asset tables `messages` and `deliveries`
// at runtime. Route handlers and the fanout helper call these; nothing here
// imports route code.

import { nowIso } from './time';
import type { DeliveryPreference } from '../preferences';
import { REACTION_EMOJI } from '../reactions';
import {
	isEntityKind,
	isFactSource,
	type EntityKind,
	type FactSource
} from './memory-kinds';

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
	// Editing (M24): NULL until the author first edits the message, then an
	// ISO 8601 string. Omitted on insert — a new message is unedited (NULL).
	edited_at?: string | null;
	// Pinning (M37): NULL while unpinned, an ISO 8601 string once pinned.
	// Omitted on insert — a new message is unpinned (NULL).
	pinned_at?: string | null;
	// Replies (M42): the id of the message this one replies to, or NULL for a
	// normal message. Set once at creation, never changed.
	reply_to_message_id?: string | null;
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

export interface SmsConsent {
	id: string;
	name: string;
	phone: string;
	consented_at: string;
}

/**
 * Record one SMS opt-in consent — the audit trail behind the /sms-opt-in
 * form (M34). The route validates the payload before calling this; this is
 * the only runtime write path to `sms_consents`.
 */
export async function insertSmsConsent(db: D1Database, c: SmsConsent): Promise<void> {
	await db
		.prepare(
			'INSERT INTO sms_consents (id, name, phone, consented_at) VALUES (?, ?, ?, ?)'
		)
		.bind(c.id, c.name, c.phone, c.consented_at)
		.run();
}

/**
 * Create a household member and add them as a participant to every existing
 * conversation, in one atomic D1 batch — so a new member can never exist
 * outside the household's conversations. A runtime write path to `people` and
 * `participants` (M40).
 */
export async function createPersonWithParticipants(
	db: D1Database,
	person: { id: string; display_name: string; created_at: string },
	conversationIds: string[]
): Promise<void> {
	const statements = [
		db
			.prepare('INSERT INTO people (id, display_name, created_at) VALUES (?, ?, ?)')
			.bind(person.id, person.display_name, person.created_at),
		...conversationIds.map((conversationId) =>
			db
				.prepare(
					`INSERT OR IGNORE INTO participants
					 (conversation_id, person_id, delivery_preference, muted)
					 VALUES (?, ?, 'all', 0)`
				)
				.bind(conversationId, person.id)
		)
	];
	await db.batch(statements);
}

/** Rename a household member (M40). */
export async function updatePersonName(
	db: D1Database,
	personId: string,
	displayName: string
): Promise<void> {
	await db
		.prepare('UPDATE people SET display_name = ? WHERE id = ?')
		.bind(displayName, personId)
		.run();
}

/**
 * Add one endpoint (an address on a transport) to a household member (M40).
 * The schema's UNIQUE(type, address) constraint makes a duplicate throw — the
 * route maps that to a 409.
 */
export async function insertEndpoint(
	db: D1Database,
	endpoint: {
		id: string;
		person_id: string;
		type: EndpointType;
		address: string;
		created_at: string;
	}
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO endpoints (id, person_id, type, address, verified_at, created_at)
			 VALUES (?, ?, ?, ?, NULL, ?)`
		)
		.bind(endpoint.id, endpoint.person_id, endpoint.type, endpoint.address, endpoint.created_at)
		.run();
}

/** Every household member with their endpoints attached (M40). */
export async function listPeopleWithEndpoints(
	db: D1Database
): Promise<
	Array<{
		id: string;
		display_name: string;
		role: string;
		created_at: string;
		endpoints: Array<{ id: string; type: string; address: string }>;
	}>
> {
	const { results: people } = await db
		.prepare('SELECT id, display_name, role, created_at FROM people ORDER BY display_name')
		.all<{ id: string; display_name: string; role: string; created_at: string }>();
	const { results: endpoints } = await db
		.prepare('SELECT id, person_id, type, address FROM endpoints ORDER BY type, address')
		.all<{ id: string; person_id: string; type: string; address: string }>();

	const byPerson = new Map<string, Array<{ id: string; type: string; address: string }>>();
	for (const e of endpoints) {
		const list = byPerson.get(e.person_id);
		const entry = { id: e.id, type: e.type, address: e.address };
		if (list) list.push(entry);
		else byPerson.set(e.person_id, [entry]);
	}
	return people.map((p) => ({ ...p, endpoints: byPerson.get(p.id) ?? [] }));
}

/** Insert one canonical message. */
export async function insertMessage(db: D1Database, m: Message): Promise<void> {
	await db
		.prepare(
			`INSERT INTO messages
			 (id, conversation_id, author_person_id, body, source_transport, created_at, reply_to_message_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			m.id,
			m.conversation_id,
			m.author_person_id,
			m.body,
			m.source_transport,
			m.created_at,
			m.reply_to_message_id ?? null
		)
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

/**
 * Edit a message's body in place and stamp `edited_at`. The author id is part
 * of the WHERE clause, so only the message's own author can edit it, and
 * `deleted_at IS NULL` makes editing a retracted message impossible. Returns
 * true if exactly this UPDATE changed a row — the caller has already confirmed
 * the message exists, the caller is its author, and it is not deleted, so a
 * false return is not expected in practice.
 */
export async function editMessage(
	db: D1Database,
	messageId: string,
	authorPersonId: string,
	body: string
): Promise<boolean> {
	const res = await db
		.prepare(
			`UPDATE messages SET body = ?, edited_at = ?
			 WHERE id = ? AND author_person_id = ? AND deleted_at IS NULL`
		)
		.bind(body, nowIso(), messageId, authorPersonId)
		.run();
	return (res.meta.changes ?? 0) > 0;
}

/** One emoji's reaction tally on a message: the count and who reacted. */
export interface ReactionSummary {
	emoji: string;
	count: number;
	people: string[];
}

/**
 * Toggle one person's emoji reaction on a message (M36): if the person
 * already holds that emoji on that message it is removed, otherwise it is
 * added. Returns which way it went. The UNIQUE(message_id, person_id, emoji)
 * constraint keeps a reaction idempotent. The only runtime write path to
 * `reactions`.
 */
export async function toggleReaction(
	db: D1Database,
	messageId: string,
	personId: string,
	emoji: string
): Promise<'added' | 'removed'> {
	const existing = await db
		.prepare('SELECT id FROM reactions WHERE message_id = ? AND person_id = ? AND emoji = ?')
		.bind(messageId, personId, emoji)
		.first<{ id: string }>();
	if (existing) {
		await db
			.prepare('DELETE FROM reactions WHERE message_id = ? AND person_id = ? AND emoji = ?')
			.bind(messageId, personId, emoji)
			.run();
		return 'removed';
	}
	await db
		.prepare(
			'INSERT INTO reactions (id, message_id, person_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(crypto.randomUUID(), messageId, personId, emoji, nowIso())
		.run();
	return 'added';
}

/**
 * Load reaction tallies for a set of messages, grouped by message id. Each
 * message maps to an array of per-emoji summaries ordered by `REACTION_EMOJI`;
 * a message with no reactions is absent from the map.
 */
export async function loadReactions(
	db: D1Database,
	messageIds: string[]
): Promise<Map<string, ReactionSummary[]>> {
	const out = new Map<string, ReactionSummary[]>();
	if (messageIds.length === 0) return out;

	const placeholders = messageIds.map(() => '?').join(',');
	const { results } = await db
		.prepare(
			`SELECT message_id, emoji, person_id FROM reactions WHERE message_id IN (${placeholders})`
		)
		.bind(...messageIds)
		.all<{ message_id: string; emoji: string; person_id: string }>();

	// message_id -> emoji -> person_ids
	const byMessage = new Map<string, Map<string, string[]>>();
	for (const row of results) {
		let emojiMap = byMessage.get(row.message_id);
		if (!emojiMap) {
			emojiMap = new Map();
			byMessage.set(row.message_id, emojiMap);
		}
		const people = emojiMap.get(row.emoji);
		if (people) people.push(row.person_id);
		else emojiMap.set(row.emoji, [row.person_id]);
	}

	for (const [messageId, emojiMap] of byMessage) {
		const summaries: ReactionSummary[] = [];
		for (const emoji of REACTION_EMOJI) {
			const people = emojiMap.get(emoji);
			if (people && people.length > 0) summaries.push({ emoji, count: people.length, people });
		}
		if (summaries.length > 0) out.set(messageId, summaries);
	}
	return out;
}

/**
 * Pin or unpin a message (M37): `pinned: true` stamps `pinned_at`,
 * `pinned: false` clears it back to NULL. Pinning is a soft, reversible state
 * any household member may set. The only runtime write path to `pinned_at`.
 */
export async function setMessagePinned(
	db: D1Database,
	messageId: string,
	pinned: boolean
): Promise<void> {
	await db
		.prepare('UPDATE messages SET pinned_at = ? WHERE id = ?')
		.bind(pinned ? nowIso() : null, messageId)
		.run();
}

export interface PushSubscriptionRow {
	id: string;
	person_id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	created_at: string;
}

/**
 * Store (or refresh) a Web Push subscription (M38). Keyed on `endpoint`: a
 * browser that re-subscribes with the same endpoint updates its row rather
 * than creating a duplicate. The only runtime write path to
 * `push_subscriptions` other than expiry cleanup.
 */
export async function upsertPushSubscription(
	db: D1Database,
	sub: PushSubscriptionRow
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO push_subscriptions (id, person_id, endpoint, p256dh, auth, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(endpoint) DO UPDATE SET
			   person_id = excluded.person_id,
			   p256dh = excluded.p256dh,
			   auth = excluded.auth`
		)
		.bind(sub.id, sub.person_id, sub.endpoint, sub.p256dh, sub.auth, sub.created_at)
		.run();
}

/** Every stored push subscription. */
export async function listPushSubscriptions(
	db: D1Database
): Promise<PushSubscriptionRow[]> {
	const { results } = await db
		.prepare('SELECT id, person_id, endpoint, p256dh, auth, created_at FROM push_subscriptions')
		.all<PushSubscriptionRow>();
	return results;
}

/** Remove a push subscription by its endpoint (browser unsubscribe). */
export async function deletePushSubscriptionByEndpoint(
	db: D1Database,
	endpoint: string
): Promise<void> {
	await db
		.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
		.bind(endpoint)
		.run();
}

/** Remove a push subscription by id (used to prune an expired endpoint). */
export async function deletePushSubscription(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(id).run();
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

/** Add a person to a conversation as a participant (idempotent — M43). */
export async function addParticipant(
	db: D1Database,
	conversationId: string,
	personId: string
): Promise<void> {
	await db
		.prepare(
			`INSERT OR IGNORE INTO participants
			 (conversation_id, person_id, delivery_preference, muted)
			 VALUES (?, ?, 'all', 0)`
		)
		.bind(conversationId, personId)
		.run();
}

/** Remove a person from a conversation's participants (M43). */
export async function removeParticipant(
	db: D1Database,
	conversationId: string,
	personId: string
): Promise<void> {
	await db
		.prepare('DELETE FROM participants WHERE conversation_id = ? AND person_id = ?')
		.bind(conversationId, personId)
		.run();
}

/** The people participating in a conversation, with their display names. */
export async function listParticipants(
	db: D1Database,
	conversationId: string
): Promise<Array<{ person_id: string; display_name: string }>> {
	const { results } = await db
		.prepare(
			`SELECT p.person_id AS person_id, pe.display_name AS display_name
			 FROM participants p
			 JOIN people pe ON pe.id = p.person_id
			 WHERE p.conversation_id = ?
			 ORDER BY pe.display_name`
		)
		.bind(conversationId)
		.all<{ person_id: string; display_name: string }>();
	return results;
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
 * Update a conversation's name and/or archived state. Archiving is a soft,
 * reversible state — `archived: true` stamps `archived_at`, `archived: false`
 * clears it back to NULL; the conversation row and all its messages and
 * participants are kept either way. The runtime write path to a conversation
 * row after creation.
 */
export async function updateConversation(
	db: D1Database,
	conversationId: string,
	fields: { name?: string; archived?: boolean }
): Promise<void> {
	const sets: string[] = [];
	const binds: Array<string | null> = [];
	if (fields.name !== undefined) {
		sets.push('name = ?');
		binds.push(fields.name);
	}
	if (fields.archived !== undefined) {
		sets.push('archived_at = ?');
		binds.push(fields.archived ? nowIso() : null);
	}
	if (sets.length === 0) return;
	binds.push(conversationId);
	await db
		.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...binds)
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

// --- Household memory graph (M71) ----------------------------------------
//
// The memory graph is two user-asset tables: `memory_entities` (nodes) and
// `memory_facts` (edges/triples). These helpers are the only runtime write
// path to them. The kind/source string sets are validated against
// memory-kinds.ts — the single source of truth — so a value outside the
// declared set is rejected here, not silently stored.

export interface MemoryEntity {
	id: string;
	kind: EntityKind;
	name: string;
	person_id: string | null;
	created_at: string;
}

export interface MemoryFact {
	id: string;
	subject_id: string;
	predicate: string;
	object_text: string | null;
	object_entity_id: string | null;
	valid_at: string | null;
	confidence: number;
	status: 'proposed' | 'confirmed';
	source: FactSource;
	source_message_id: string | null;
	source_ref: string | null;
	created_at: string;
	confirmed_at: string | null;
	confirmed_by: string | null;
}

/** Whether a household member has the 'adult' role — the memory gate. */
export async function isAdult(db: D1Database, personId: string): Promise<boolean> {
	const row = await db
		.prepare('SELECT role FROM people WHERE id = ?')
		.bind(personId)
		.first<{ role: string }>();
	return row?.role === 'adult';
}

/** Find a memory entity by name, case-insensitively, or null. */
export async function findEntityByName(
	db: D1Database,
	name: string
): Promise<MemoryEntity | null> {
	return await db
		.prepare('SELECT * FROM memory_entities WHERE lower(name) = lower(?)')
		.bind(name.trim())
		.first<MemoryEntity>();
}

/**
 * Resolve an entity by name, creating it with the given kind if it does not
 * exist yet. Rejects a kind outside ENTITY_KINDS. The graph is small and a
 * household has one "Mia", so name is treated as the natural key.
 */
export async function upsertEntity(
	db: D1Database,
	entity: { kind: string; name: string; person_id?: string | null }
): Promise<MemoryEntity> {
	const name = entity.name.trim();
	if (name === '') throw new Error('entity name is required');
	if (!isEntityKind(entity.kind)) throw new Error(`unknown entity kind: ${entity.kind}`);
	const existing = await findEntityByName(db, name);
	if (existing) return existing;
	const row: MemoryEntity = {
		id: crypto.randomUUID(),
		kind: entity.kind,
		name,
		person_id: entity.person_id ?? null,
		created_at: nowIso()
	};
	await db
		.prepare(
			'INSERT INTO memory_entities (id, kind, name, person_id, created_at) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(row.id, row.kind, row.name, row.person_id, row.created_at)
		.run();
	return row;
}

export interface NewFact {
	subject_id: string;
	predicate: string;
	object_text?: string | null;
	object_entity_id?: string | null;
	valid_at?: string | null;
	confidence: number;
	status: 'proposed' | 'confirmed';
	source: string;
	source_message_id?: string | null;
	source_ref?: string | null;
}

/**
 * Insert a memory fact. The shape gate for the `memory_facts` write path:
 * rejects a source outside FACT_SOURCES, an unknown status, an empty
 * predicate, and — the table's core invariant — a fact whose object is not
 * exactly one of a literal (object_text) or an entity (object_entity_id).
 */
export async function insertFact(db: D1Database, fact: NewFact): Promise<MemoryFact> {
	if (!isFactSource(fact.source)) throw new Error(`unknown fact source: ${fact.source}`);
	if (fact.status !== 'proposed' && fact.status !== 'confirmed') {
		throw new Error(`unknown fact status: ${fact.status}`);
	}
	const predicate = fact.predicate.trim();
	if (predicate === '') throw new Error('fact predicate is required');
	const objectText = fact.object_text ?? null;
	const objectEntityId = fact.object_entity_id ?? null;
	if ((objectText === null) === (objectEntityId === null)) {
		throw new Error('a fact must have exactly one of object_text / object_entity_id');
	}
	const now = nowIso();
	const row: MemoryFact = {
		id: crypto.randomUUID(),
		subject_id: fact.subject_id,
		predicate,
		object_text: objectText,
		object_entity_id: objectEntityId,
		valid_at: fact.valid_at ?? null,
		confidence: fact.confidence,
		status: fact.status,
		source: fact.source,
		source_message_id: fact.source_message_id ?? null,
		source_ref: fact.source_ref ?? null,
		created_at: now,
		confirmed_at: fact.status === 'confirmed' ? now : null,
		confirmed_by: null
	};
	await db
		.prepare(
			`INSERT INTO memory_facts
			 (id, subject_id, predicate, object_text, object_entity_id, valid_at, confidence,
			  status, source, source_message_id, source_ref, created_at, confirmed_at, confirmed_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			row.id,
			row.subject_id,
			row.predicate,
			row.object_text,
			row.object_entity_id,
			row.valid_at,
			row.confidence,
			row.status,
			row.source,
			row.source_message_id,
			row.source_ref,
			row.created_at,
			row.confirmed_at,
			row.confirmed_by
		)
		.run();
	return row;
}

/**
 * Confirm a proposed fact: flip it to 'confirmed' and stamp who/when. The
 * `status = 'proposed'` guard makes a repeat confirm a no-op. Returns true if
 * exactly this call confirmed the fact.
 */
export async function confirmFact(
	db: D1Database,
	factId: string,
	personId: string
): Promise<boolean> {
	const res = await db
		.prepare(
			`UPDATE memory_facts SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?
			 WHERE id = ? AND status = 'proposed'`
		)
		.bind(nowIso(), personId, factId)
		.run();
	return (res.meta.changes ?? 0) > 0;
}

/** The facts whose subject is `subjectId`, oldest-first. */
export async function factsForSubject(
	db: D1Database,
	subjectId: string,
	opts: { confirmedOnly?: boolean } = {}
): Promise<MemoryFact[]> {
	const clause = opts.confirmedOnly ? "AND status = 'confirmed'" : '';
	const { results } = await db
		.prepare(
			`SELECT * FROM memory_facts WHERE subject_id = ? ${clause} ORDER BY created_at ASC`
		)
		.bind(subjectId)
		.all<MemoryFact>();
	return results;
}

// A memory fact joined with its subject and (optional) object entity names —
// the shape the proposed-fact review UI and the recall layer want (M73).
export interface FactWithNames extends MemoryFact {
	subject_name: string;
	object_name: string | null;
}

const FACT_WITH_NAMES_SELECT = `
	SELECT f.id, f.subject_id, f.predicate, f.object_text, f.object_entity_id,
	       f.valid_at, f.confidence, f.status, f.source, f.source_message_id,
	       f.source_ref, f.created_at, f.confirmed_at, f.confirmed_by,
	       s.name AS subject_name, o.name AS object_name
	FROM memory_facts f
	JOIN memory_entities s ON s.id = f.subject_id
	LEFT JOIN memory_entities o ON o.id = f.object_entity_id`;

/** Every proposed (awaiting-confirmation) fact, newest first, with names. */
export async function proposedFactsWithNames(db: D1Database): Promise<FactWithNames[]> {
	const { results } = await db
		.prepare(`${FACT_WITH_NAMES_SELECT} WHERE f.status = 'proposed' ORDER BY f.created_at DESC`)
		.all<FactWithNames>();
	return results;
}

/** One fact by id, with its subject/object names, or null. */
export async function factWithNames(
	db: D1Database,
	id: string
): Promise<FactWithNames | null> {
	return await db
		.prepare(`${FACT_WITH_NAMES_SELECT} WHERE f.id = ?`)
		.bind(id)
		.first<FactWithNames>();
}

/**
 * Reject (delete) a proposed fact. The `status = 'proposed'` guard means a
 * confirmed fact can never be removed by this path. Returns true if a row was
 * deleted.
 */
export async function rejectProposedFact(db: D1Database, id: string): Promise<boolean> {
	const res = await db
		.prepare("DELETE FROM memory_facts WHERE id = ? AND status = 'proposed'")
		.bind(id)
		.run();
	return (res.meta.changes ?? 0) > 0;
}
