import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import {
	isAdult,
	upsertEntity,
	insertFact,
	findEntityByName,
	factsForSubject
} from '$lib/server/db';
import { indexFact, factSentence } from '$lib/server/memory-index';

// The household memory graph (M71). Every route here is adult-gated: the
// acting member's id is supplied by the caller, and a non-adult is refused
// with 403 — the graph holds things like the wifi password, so guests and
// children are kept out. See .agent/household-memory.md.

// POST /api/memory/facts — store an explicit household fact, e.g.
// { personId, subject: "the house", predicate: "wifi_password", object: "hunter2" }.
// An explicit fact is stored already confirmed, with full confidence.
//
// The object is a literal string by default; pass objectIsEntity: true to make
// the object another graph node (e.g. subject "Mia", predicate "teacher",
// object "Ms. Lee", objectIsEntity true). subjectKind / objectKind set the
// node kind when an entity is created (default "thing").
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const personId = typeof raw?.personId === 'string' ? raw.personId : '';
	const subject = typeof raw?.subject === 'string' ? raw.subject.trim() : '';
	const predicate = typeof raw?.predicate === 'string' ? raw.predicate.trim() : '';
	const object = typeof raw?.object === 'string' ? raw.object.trim() : '';
	if (personId === '' || subject === '' || predicate === '' || object === '') {
		throw error(400, 'Expected JSON body { personId, subject, predicate, object }');
	}
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const subjectKind = typeof raw?.subjectKind === 'string' ? raw.subjectKind : 'thing';
	const objectKind = typeof raw?.objectKind === 'string' ? raw.objectKind : 'thing';
	const validAt = typeof raw?.validAt === 'string' ? raw.validAt : null;
	const objectIsEntity = raw?.objectIsEntity === true;

	let fact;
	try {
		const subjectEntity = await upsertEntity(db, { kind: subjectKind, name: subject });
		fact = objectIsEntity
			? await insertFact(db, {
					subject_id: subjectEntity.id,
					predicate,
					object_entity_id: (await upsertEntity(db, { kind: objectKind, name: object })).id,
					valid_at: validAt,
					confidence: 1.0,
					status: 'confirmed',
					source: 'explicit'
				})
			: await insertFact(db, {
					subject_id: subjectEntity.id,
					predicate,
					object_text: object,
					valid_at: validAt,
					confidence: 1.0,
					status: 'confirmed',
					source: 'explicit'
				});
	} catch (e) {
		// upsertEntity / insertFact reject a bad kind, source, or object shape.
		throw error(400, (e as Error).message);
	}

	// Index the (confirmed) fact for semantic recall (M72) — best-effort,
	// after the response via waitUntil; a no-op without Workers AI / Vectorize.
	const indexTask = indexFact(platform!.env, fact.id, factSentence(subject, predicate, object));
	if (platform?.context?.waitUntil) platform.context.waitUntil(indexTask);
	else await indexTask;

	return json(fact, { status: 201 });
};

// GET /api/memory/facts?subject=<name>&personId=<id> — the confirmed facts
// whose subject is the named entity. An unknown subject is not an error: it
// returns an empty set.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const subject = url.searchParams.get('subject')?.trim() ?? '';
	if (subject === '') throw error(400, 'A ?subject= name is required');

	const entity = await findEntityByName(db, subject);
	if (!entity) return json({ entity: null, facts: [] });
	const facts = await factsForSubject(db, entity.id, { confirmedOnly: true });
	return json({ entity, facts });
};
