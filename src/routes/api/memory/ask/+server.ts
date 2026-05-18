import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult } from '$lib/server/db';
import { relevantFactIds } from '$lib/server/memory-index';

// The Workers AI model used to answer a household-memory question.
const ASK_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// A recent-facts window the model always sees, plus the facts retrieved as
// most relevant to the question from anywhere in the graph.
const RECENT_FACTS = 40;
const RELEVANT_K = 20;

interface FactRow {
	id: string;
	predicate: string;
	object_text: string | null;
	object_name: string | null;
	valid_at: string | null;
	subject_name: string;
}

// Render one fact as a line the model can read.
function renderFact(f: FactRow): string {
	const object = f.object_text ?? f.object_name ?? '';
	const when = f.valid_at ? ` (on ${f.valid_at})` : '';
	return `${f.subject_name} — ${f.predicate.replace(/_/g, ' ')}: ${object}${when}`;
}

// POST /api/memory/ask — answer a plain-language question about the household
// from the confirmed facts in the memory graph (M72). Body: { personId,
// question }. Adult-gated. Returns { available, answer }.
//
// Gated like the other AI features: with no Workers AI binding it returns 503.
// Semantic retrieval (the Vectorize facts index) is best-effort — without it,
// the model still answers from the recent-facts window.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const personId = typeof raw?.personId === 'string' ? raw.personId : '';
	const question = typeof raw?.question === 'string' ? raw.question.trim() : '';
	if (personId === '' || question === '') {
		throw error(400, 'Expected JSON body { personId, question }');
	}
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, answer: '' }, { status: 503 });
	}

	const baseSelect = `SELECT f.id, f.predicate, f.object_text, f.valid_at,
	        s.name AS subject_name, o.name AS object_name
	 FROM memory_facts f
	 JOIN memory_entities s ON s.id = f.subject_id
	 LEFT JOIN memory_entities o ON o.id = f.object_entity_id
	 WHERE f.status = 'confirmed'`;

	const recent = await db
		.prepare(`${baseSelect} ORDER BY f.created_at DESC LIMIT ${RECENT_FACTS}`)
		.all<FactRow>();

	// Semantic retrieval pulls in relevant facts older than the recent window.
	let relevant: FactRow[] = [];
	const relevantIds = await relevantFactIds(platform!.env, question, RELEVANT_K);
	const recentIds = new Set(recent.results.map((r) => r.id));
	const extraIds = relevantIds.filter((id) => !recentIds.has(id));
	if (extraIds.length > 0) {
		const placeholders = extraIds.map(() => '?').join(',');
		const r = await db
			.prepare(`${baseSelect} AND f.id IN (${placeholders})`)
			.bind(...extraIds)
			.all<FactRow>();
		relevant = r.results;
	}

	const facts = [...relevant, ...recent.results];
	if (facts.length === 0) {
		return json({
			available: true,
			answer: 'The household memory is empty — no facts have been saved yet.'
		});
	}

	const prompt = [
		`Answer the question using ONLY these household facts. If the answer is`,
		`not among them, say you could not find it. Be concise.`,
		``,
		`Household facts:`,
		facts.map(renderFact).join('\n'),
		``,
		`Question: ${question}`
	].join('\n');

	try {
		const result = (await ai.run(ASK_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You answer questions about a household from its saved facts.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const answer = (result.response ?? '').trim();
		if (answer === '') {
			return json({ available: false, answer: '' }, { status: 503 });
		}
		return json({ available: true, answer });
	} catch (e) {
		console.error('[memory] ask failed', e);
		return json({ available: false, answer: '' }, { status: 503 });
	}
};
