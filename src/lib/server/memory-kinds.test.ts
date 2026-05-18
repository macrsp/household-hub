import { describe, it, expect } from 'vitest';
import { ENTITY_KINDS, FACT_SOURCES, isEntityKind, isFactSource } from './memory-kinds';
import { upsertEntity, insertFact } from './db';

// A minimal D1 stub: enough for upsertEntity (a .first() lookup then an
// INSERT) and insertFact (an INSERT). `firstResult` is what .first() returns —
// null means "no existing entity", so upsertEntity creates one.
function stubDb(firstResult: unknown = null) {
	const inserts: string[] = [];
	const make = (sql: string) => {
		const stmt = {
			bind() {
				return stmt;
			},
			async first() {
				return firstResult;
			},
			async run() {
				if (/^INSERT/i.test(sql.trim())) inserts.push(sql.trim().split(/\s+/)[2]);
				return { meta: { changes: 1 } };
			},
			async all() {
				return { results: [] };
			}
		};
		return stmt;
	};
	return { db: { prepare: make } as unknown as D1Database, inserts };
}

// PLANS.md invariant three: the declared string sets have one source of truth
// (memory-kinds.ts) and the server validators accept exactly that set. These
// tests enumerate the sets so adding or renaming an entry without updating the
// validator fails the build.

describe('isEntityKind', () => {
	it('accepts every declared entity kind', () => {
		for (const kind of ENTITY_KINDS) expect(isEntityKind(kind)).toBe(true);
	});

	it('rejects an undeclared value or non-string', () => {
		expect(isEntityKind('vehicle')).toBe(false);
		expect(isEntityKind('')).toBe(false);
		expect(isEntityKind(42)).toBe(false);
	});
});

describe('isFactSource', () => {
	it('accepts every declared fact source', () => {
		for (const source of FACT_SOURCES) expect(isFactSource(source)).toBe(true);
	});

	it('rejects an undeclared value or non-string', () => {
		expect(isFactSource('sms')).toBe(false);
		expect(isFactSource(null)).toBe(false);
	});
});

describe('upsertEntity validation', () => {
	it('creates an entity for every declared kind', async () => {
		for (const kind of ENTITY_KINDS) {
			const { db } = stubDb(null);
			const entity = await upsertEntity(db, { kind, name: `a ${kind}` });
			expect(entity.kind).toBe(kind);
		}
	});

	it('rejects a kind outside ENTITY_KINDS', async () => {
		const { db } = stubDb(null);
		await expect(upsertEntity(db, { kind: 'vehicle', name: 'the car' })).rejects.toThrow(
			/unknown entity kind/
		);
	});
});

describe('insertFact validation', () => {
	it('accepts a fact for every declared source', async () => {
		for (const source of FACT_SOURCES) {
			const { db } = stubDb();
			const fact = await insertFact(db, {
				subject_id: 'e1',
				predicate: 'note',
				object_text: 'value',
				confidence: 1,
				status: 'confirmed',
				source
			});
			expect(fact.source).toBe(source);
		}
	});

	it('rejects a source outside FACT_SOURCES', async () => {
		const { db } = stubDb();
		await expect(
			insertFact(db, {
				subject_id: 'e1',
				predicate: 'note',
				object_text: 'value',
				confidence: 1,
				status: 'confirmed',
				source: 'telepathy'
			})
		).rejects.toThrow(/unknown fact source/);
	});

	it('rejects a fact whose object is both a literal and an entity', async () => {
		const { db } = stubDb();
		await expect(
			insertFact(db, {
				subject_id: 'e1',
				predicate: 'teacher',
				object_text: 'Ms. Lee',
				object_entity_id: 'e2',
				confidence: 1,
				status: 'confirmed',
				source: 'explicit'
			})
		).rejects.toThrow(/exactly one of/);
	});

	it('rejects a fact with neither a literal nor an entity object', async () => {
		const { db } = stubDb();
		await expect(
			insertFact(db, {
				subject_id: 'e1',
				predicate: 'teacher',
				confidence: 1,
				status: 'confirmed',
				source: 'explicit'
			})
		).rejects.toThrow(/exactly one of/);
	});
});
