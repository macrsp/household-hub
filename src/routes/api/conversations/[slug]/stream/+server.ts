import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { loadReactions, type ReactionSummary } from '$lib/server/db';

// How often the stream checks D1 for new messages. Server-side, so the client
// holds one connection and does no polling of its own.
const POLL_MS = 1500;

// GET /api/conversations/[slug]/stream — a Server-Sent Events stream of the
// conversation's messages. On connect it emits the recent backlog, then each
// new message as it appears. This replaces client-side polling: the browser
// opens one EventSource and receives pushes.
//
// v1.x keeps a short server-side poll of D1 rather than a Durable Object —
// right-sized for a household and a clean seam to swap for true push later
// (see .agent/post-v1-roadmap.md, M10).
export const GET: RequestHandler = async ({ platform, params }) => {
	const db = requireDb(platform);

	const conversation = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(params.slug)
		.first<{ id: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${params.slug}`);
	const conversationId = conversation.id;

	const encoder = new TextEncoder();
	let open = true;

	const stream = new ReadableStream({
		async start(controller) {
			// Messages already sent on this connection, id -> change marker
			// ('<deleted_at>|<edited_at>'). A message is (re-)emitted when it is
			// new OR its marker changed — so a soft-delete or an edit reaches
			// every open client, not just the member who made the change.
			const seen = new Map<string, string>();
			controller.enqueue(encoder.encode(': connected\n\n'));

			while (open) {
				try {
					const { results } = await db
						.prepare(
							`SELECT id, body, source_transport, created_at, deleted_at, edited_at,
							        author_person_id, author_name,
							        delivery_total, delivery_ok, delivery_failed
							 FROM (
							   SELECT m.id,
							          CASE WHEN m.deleted_at IS NOT NULL THEN '' ELSE m.body END AS body,
							          m.source_transport, m.created_at, m.deleted_at, m.edited_at,
							          m.author_person_id, p.display_name AS author_name,
							          (SELECT count(*) FROM deliveries d WHERE d.message_id = m.id) AS delivery_total,
							          (SELECT count(*) FROM deliveries d WHERE d.message_id = m.id
							             AND d.status IN ('sent', 'sent_stubbed', 'delivered')) AS delivery_ok,
							          (SELECT count(*) FROM deliveries d WHERE d.message_id = m.id
							             AND d.status = 'failed') AS delivery_failed
							   FROM messages m
							   JOIN people p ON p.id = m.author_person_id
							   WHERE m.conversation_id = ?
							   ORDER BY m.created_at DESC
							   LIMIT 100
							 )
							 ORDER BY created_at ASC`
						)
						.bind(conversationId)
						.all<Record<string, unknown>>();

					// Attach reaction tallies; their signature joins the change
					// marker so adding or removing a reaction re-emits the row.
					const reactions = await loadReactions(
						db,
						results.map((r) => r.id as string)
					);

					let emitted = 0;
					for (const row of results) {
						const id = row.id as string;
						const rxns = reactions.get(id) ?? [];
						row.reactions = rxns;
						const rxnSig = rxns
							.map((s: ReactionSummary) => s.emoji + s.people.slice().sort().join('+'))
							.join(',');
						const marker = `${(row.deleted_at as string | null) ?? ''}|${
							(row.edited_at as string | null) ?? ''
						}|${rxnSig}`;
						if (seen.get(id) === marker) continue;
						seen.set(id, marker);
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
						emitted++;
					}
					// A heartbeat comment on idle ticks keeps the connection alive.
					if (emitted === 0) controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					// Transient D1 error — keep the stream open and retry next tick.
				}
				await new Promise((resolve) => setTimeout(resolve, POLL_MS));
			}

			try {
				controller.close();
			} catch {
				// already closed
			}
		},
		// Fires when the client disconnects — stop the poll loop.
		cancel() {
			open = false;
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive'
		}
	});
};
