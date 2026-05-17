#!/usr/bin/env node
//
// Post-deploy data-integrity probes for household-hub's Cloudflare D1
// database — PLANS.md User-Asset Durability invariant 4 ("a post-deploy data
// probe per user-asset record class"). Each probe is a query that must always
// return zero; a non-zero count means orphaned or malformed user-asset rows.
// The queries mirror the manifest in migrations/README.md.
//
// Usage:  node scripts/probe-d1.mjs --local      (default)
//         node scripts/probe-d1.mjs --remote     (needs CLOUDFLARE_API_TOKEN)
//
// Exits 0 if every invariant holds, 1 if any is violated.

import { execFileSync } from 'node:child_process';

const target = process.argv.includes('--remote') ? '--remote' : '--local';

const PROBES = [
	{
		name: 'people — blank display_name',
		sql: "SELECT count(*) AS n FROM people WHERE display_name IS NULL OR display_name = ''"
	},
	{
		name: 'endpoints — person_id not in people',
		sql: 'SELECT count(*) AS n FROM endpoints WHERE person_id NOT IN (SELECT id FROM people)'
	},
	{
		name: 'conversations — blank slug',
		sql: "SELECT count(*) AS n FROM conversations WHERE slug IS NULL OR slug = ''"
	},
	{
		name: 'conversations — archived_at earlier than created_at',
		sql:
			'SELECT count(*) AS n FROM conversations ' +
			'WHERE archived_at IS NOT NULL AND archived_at < created_at'
	},
	{
		name: 'participants — dangling conversation_id / person_id',
		sql:
			'SELECT count(*) AS n FROM participants ' +
			'WHERE conversation_id NOT IN (SELECT id FROM conversations) ' +
			'OR person_id NOT IN (SELECT id FROM people)'
	},
	{
		name: 'messages — dangling author_person_id / conversation_id',
		sql:
			'SELECT count(*) AS n FROM messages ' +
			'WHERE author_person_id NOT IN (SELECT id FROM people) ' +
			'OR conversation_id NOT IN (SELECT id FROM conversations)'
	},
	{
		name: 'messages — deleted_at earlier than created_at',
		sql:
			'SELECT count(*) AS n FROM messages ' +
			'WHERE deleted_at IS NOT NULL AND deleted_at < created_at'
	},
	{
		name: 'messages — edited_at earlier than created_at',
		sql:
			'SELECT count(*) AS n FROM messages ' +
			'WHERE edited_at IS NOT NULL AND edited_at < created_at'
	},
	{
		name: 'deliveries — dangling message_id / endpoint_id',
		sql:
			'SELECT count(*) AS n FROM deliveries ' +
			'WHERE message_id NOT IN (SELECT id FROM messages) ' +
			'OR endpoint_id NOT IN (SELECT id FROM endpoints)'
	}
];

function runQuery(sql) {
	const out = execFileSync(
		'npx',
		['wrangler', 'd1', 'execute', 'household-hub-db', target, '--json', '--command', sql],
		{ encoding: 'utf8' }
	);
	// `--json` writes the result array to stdout; any wrangler banner has no
	// '[', so the first '[' is the start of the JSON.
	const json = JSON.parse(out.slice(out.indexOf('[')));
	return json[0].results[0].n;
}

console.log(`household-hub D1 data probes (${target})\n`);
let failed = 0;
for (const probe of PROBES) {
	let count;
	try {
		count = runQuery(probe.sql);
	} catch (e) {
		console.error(`  ERROR  ${probe.name} — ${e instanceof Error ? e.message : e}`);
		failed++;
		continue;
	}
	if (count === 0) {
		console.log(`  ok     ${probe.name}`);
	} else {
		console.error(`  FAIL   ${probe.name} — ${count} bad row(s)`);
		failed++;
	}
}

if (failed > 0) {
	console.error(`\n${failed} of ${PROBES.length} probe(s) failed.`);
	process.exit(1);
}
console.log(`\nAll ${PROBES.length} invariants hold.`);
