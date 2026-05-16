import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ENDPOINT_TYPES, SOURCE_TRANSPORTS, DELIVERY_TRANSPORTS } from './db';
import { sendSms, twilioConfigured } from './sms';

// --- Transport string set ⇄ schema CHECK parity -------------------------
//
// The accepted transport strings are declared once in db.ts. The schema
// CHECK constraints in migrations/0001_initial.sql duplicate them at the
// database layer. This block enumerates each declared set and asserts the
// matching CHECK clause accepts exactly it — so adding, removing, or renaming
// a transport without updating the schema fails the build. (Required by
// .agent/PLANS.md User-Asset Write-Path Checklist, item 3.)

const schemaSql = readFileSync('migrations/0001_initial.sql', 'utf8');

/** Extract the value list from a `<column> IN ('a', 'b', ...)` CHECK clause. */
function checkClauseValues(column: string): string[] {
	const m = schemaSql.match(new RegExp(`\\b${column} IN \\(([^)]+)\\)`));
	if (!m) throw new Error(`no CHECK ... IN clause found for column "${column}"`);
	return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}

const CASES: Array<{ name: string; column: string; declared: readonly string[] }> = [
	{ name: 'endpoints.type', column: 'type', declared: ENDPOINT_TYPES },
	{ name: 'messages.source_transport', column: 'source_transport', declared: SOURCE_TRANSPORTS },
	{ name: 'deliveries.transport', column: 'transport', declared: DELIVERY_TRANSPORTS }
];

describe('transport string sets match the schema CHECK constraints', () => {
	for (const { name, column, declared } of CASES) {
		for (const value of declared) {
			it(`${name} CHECK accepts declared value '${value}'`, () => {
				expect(checkClauseValues(column)).toContain(value);
			});
		}
		it(`${name} CHECK has no values beyond the declared set`, () => {
			expect(new Set(checkClauseValues(column))).toEqual(new Set(declared));
		});
	}
});

// --- Outbound SMS adapter: stub mode ------------------------------------

describe('sendSms stubs when Twilio is not configured', () => {
	const emptyEnv = {} as App.Platform['env'];

	it('reports Twilio as not configured with no secrets', () => {
		expect(twilioConfigured(emptyEnv)).toBe(false);
	});

	it('reports Twilio as not configured with only some secrets', () => {
		const partial = { TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 'tok' } as App.Platform['env'];
		expect(twilioConfigured(partial)).toBe(false);
	});

	it('returns a stubbed result instead of calling the network', async () => {
		const result = await sendSms(emptyEnv, '+15550000002', '[Matt]: hello');
		expect(result).toEqual({ kind: 'stubbed' });
	});
});
