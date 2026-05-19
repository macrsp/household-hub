# Hands-on AI: snap-a-flyer and conversational meal planning

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository follows the ExecPlan discipline in [`.agent/PLANS.md`](PLANS.md); maintain this document accordingly. It also follows [`CLAUDE.md`](../CLAUDE.md) and builds directly on the Household Memory arc ([`.agent/household-memory.md`](household-memory.md), M71–M79).


## Purpose / Big Picture

The household memory graph (M71–M79) can be told things and asked things. This
plan makes the AI *act* on two real-world inputs:

- **Snap a flyer.** An adult photographs a school notice, an invitation, or a
  appointment card; a Workers AI vision model reads it and proposes the event
  onto the household calendar. The photo is processed transiently and never
  stored — the value is the event, not the image.
- **Plan a meal in chat.** A member writes `@claude let's have spaghetti` in a
  conversation; the assistant works out the ingredients and adds them to the
  shopping list, then replies saying what it added. The assistant stops only
  answering and starts doing.

After this work: photographing a field-trip flyer makes "field trip — the zoo,
June 2" appear in the M73 review list and, once confirmed, on the M76 calendar;
and `@claude let's have tacos` in the groceries thread adds tortillas, beef,
and so on to the shopping list with a one-line confirmation from Claude.

"Workers AI" is the Cloudflare ML binding `event.platform.env.AI`. This plan
adds a *vision* model (`@cf/meta/llama-3.2-11b-vision-instruct`, which reads
text and scenes in an image) to its uses; everything else reuses the existing
text model and the M71–M79 memory graph.


## Progress

- [x] (2026-05-19 08:12Z) M80 — Snap a flyer: `'flyer'` added to `FACT_SOURCES`;
  `memory-extract.ts` factored to a shared `storeProposedFacts`;
  `flyer-extract.ts` (`extractFlyerFacts` — Workers AI vision model
  `@cf/meta/llama-3.2-11b-vision-instruct` reads the image, M78's
  `parseExtractedFacts` parses the events); `POST /api/memory/flyer` (adult-
  gated, raw image body, 6 MB cap, 503 without AI, image never stored); a
  "📷 Scan a flyer" file/camera control on the Household page. Gates green:
  check 486, unit 167, build, e2e api-memory 13.
- [x] (2026-05-19 08:20Z) M81 — Conversational meal planning: `maybeAssistantReply`
  now, on an `@claude` mention, also asks the model whether the message is a
  meal/grocery request; `parseGroceryItems` (pure, unit-tested) cleans the
  reply into items; each is written as a *confirmed* `needs` fact through
  `insertFact` (per-item try/catch — PLANS.md invariant 2), and the assistant's
  posted reply names what it added. Gates green: check 486, unit 172, build,
  e2e api-dev-channel 4.

Both milestones complete and deployed — see Outcomes & Retrospective.


## Context and Orientation

`household-hub` is SvelteKit + TypeScript on Cloudflare Workers/Pages; canonical
data is D1. The household memory graph is `memory_entities` + `memory_facts`
(see `.agent/household-memory.md`). Relevant existing pieces this plan reuses:

- `src/lib/server/memory-extract.ts` — `parseExtractedFacts` already parses
  `subject | predicate | object | date` lines (M78), and `runExtraction`
  stores candidates as *proposed* facts. M80 reuses the parser and the storing
  loop with a vision model in front instead of the text model.
- The propose→confirm loop (M73): proposed facts surface in the Household
  page's review panel; confirming one indexes it and, if dated (M78), the M76
  calendar shows it.
- `src/lib/server/assistant.ts` — `maybeAssistantReply` (M55/M69): the in-app
  `@claude` assistant. M81 extends it.
- The shopping list is confirmed `memory_facts` with predicate `needs` (M76);
  `/api/memory/facts` is the explicit write path.
- `FACT_SOURCES` in `src/lib/server/memory-kinds.ts` is the single source of
  truth for a fact's `source`; M80 adds `'flyer'` to it.

Every AI capability is gated: with no `AI` binding the feature reports itself
unavailable (503) and the UI control is hidden. The E2E lane has no `AI`
binding, so both milestones' routes return 503 in CI — their specs assert that
plus input validation, exactly like the M73/M75 extraction routes.


## Milestones

### M80 — Snap a flyer

At the end, an adult photographs a flyer on the Household page and its events
appear in the memory review list.

Add `'flyer'` to `FACT_SOURCES` in `src/lib/server/memory-kinds.ts` (the parity
test then covers it automatically). In `memory-extract.ts`, widen
`runExtraction`'s `source` to the full `FactSource` type and factor the
"parse candidates → store proposed facts" tail into a small `storeProposedFacts`
helper that both the text path and the new flyer path call.

Add `src/lib/server/flyer-extract.ts` with `extractFlyerFacts(env, imageBytes)`:
it calls Workers AI's vision model with the image and a prompt asking for any
events as `subject | predicate | object | date` lines (the M78 format), parses
them with `parseExtractedFacts`, and stores each as a proposed fact with
`source: 'flyer'`. Best-effort and self-gating like the other extractors.

Add `POST /api/memory/flyer?personId=<id>` — adult-gated; the request body is
the raw image bytes, capped at a few megabytes; it runs `extractFlyerFacts` and
returns `{ available, proposed }`. The image is read, passed to the model, and
discarded — never written to D1 or anywhere else.

On `src/routes/household/+page.svelte`, add a "📷 Scan a flyer" control to the
memory section: a file input with `accept="image/*"` and `capture="environment"`
so a phone opens the camera; on pick it POSTs the file and then refreshes the
proposed-facts review list.

Acceptance: gates green; `e2e/api-memory.spec.ts` gains a flyer-route test
(503 without AI, 400 on an empty body, 403 for a non-adult). Deployed, an
adult scans a flyer and the events land in the review panel.

### M81 — Conversational meal planning

At the end, `@claude let's have spaghetti` in a conversation adds the
ingredients to the shopping list.

Extend `maybeAssistantReply` in `assistant.ts`. When the triggering message
mentions `@claude`, alongside the normal reply the assistant makes one extra
model call asking: does this message ask to plan a meal or add groceries? If
so, list the grocery items, one per line; otherwise reply `NONE`. A new pure
helper `parseGroceryItems` (in `assistant.ts` or a small module) turns that
reply into a clean item list. Each item is written as a *confirmed* `needs`
fact through `insertFact` — a shopping addition is low-stakes and the member
explicitly invoked the assistant, so it skips the proposed state. The
assistant's posted reply then names what it added ("🛒 Added to the shopping
list: spaghetti, tomatoes, garlic.").

Gated and best-effort: no `AI` binding means no meal handling, exactly as the
assistant reply itself is already gated. The grocery write is the only new
user-asset write — it goes through the typed `insertFact`.

Acceptance: gates green; `parseGroceryItems` is unit-tested; the dev-channel
E2E still shows an `@claude` message posts cleanly. Deployed, a meal request
in a conversation populates the shopping list.


## User-Asset Write-Path Checklist

This plan writes the existing user-asset class `memory_facts`; it adds no new
class.

First — the class written: `memory_facts`. M80 writes *proposed* facts from
flyer extraction; M81 writes *confirmed* `needs` facts from a meal request.

Second — the shape gate: every write goes through the existing typed
`insertFact` in `src/lib/server/db.ts`, which validates the object shape and
rejects a `source` outside `FACT_SOURCES`. M80 adds `'flyer'` to that declared
set in `memory-kinds.ts`; the existing parity test `memory-kinds.test.ts`
enumerates the set and so covers the new value with no test change needed
beyond the fixture.

Third — the tests: `memory-kinds.test.ts` (parity) covers the new `'flyer'`
source; `parseExtractedFacts` is already unit-tested (M78); `parseGroceryItems`
gets its own unit test; `e2e/api-memory.spec.ts` covers the flyer route's
gating and validation. The `memory_facts` post-deploy probe in
`migrations/README.md` already covers both new write sites — no schema change.

Fourth — new try/catch around a user-asset write: M80's `extractFlyerFacts` and
M81's meal handling each wrap their work in try/catch. Neither is a silent
fallback: the proposed/`needs` `insertFact` call either succeeds or throws; the
catch only stops a vision-model or text-model failure from breaking the
unrelated HTTP response (the flyer upload) or message send (the assistant), the
same best-effort pattern as the M73 conversation extractor.


## Validation and Acceptance

Per milestone: `npm run check`, `npm run build`, `npm run test:unit`,
`npm run test:e2e`, then a branch, PR, CI green, merge, deploy, and a
verification on the deployed app. Headline acceptance: a photographed flyer's
event reaches the calendar after confirmation, and a chat meal request fills
the shopping list.


## Idempotence and Recovery

No schema migration — both milestones write through existing tables and
helpers. Flyer extraction is best-effort: a vision-model failure leaves no
partial state and the upload simply reports nothing proposed. A meal request
that the model misreads produces extra shopping items the household can delete;
nothing is destructive.


## Decision Log

2026-05-19 — Photographed flyers are not stored. The operator asked why the
original images would be kept; they would not be. The image is processed
transiently by the vision model and discarded — the extracted event is the
asset. This removes the need for an R2 bucket entirely and matches the privacy
posture of Gmail ingestion (M75), where raw email is likewise never stored.

2026-05-19 — Meal planning is conversational, not a screen. Per the operator:
`@claude let's have spaghetti` in a conversation is the interface. It reuses
the M55 assistant and the M76 `needs` shopping list rather than adding a
meal-planning UI.

2026-05-19 — Meal-request grocery items are written confirmed, not proposed.
Unlike facts the AI notices unprompted, a meal request is an explicit
instruction to the assistant, so its grocery items go straight onto the
shopping list; removing an unwanted item is a normal list edit.

2026-05-19 — Vision model: `@cf/meta/llama-3.2-11b-vision-instruct`. It reads
printed text in a photo and follows an extraction instruction, and runs on
Workers AI with no external key — the same posture as every other AI feature.


## Surprises & Discoveries

None yet — M80 will record the Workers AI vision model's exact input shape
(how the image bytes are passed) and any practical image-size limit.


## Outcomes & Retrospective

Delivered (M80–M81, merged, deployed, verified). The AI now acts on two
real-world inputs. M80: an adult photographs a flyer and a Workers AI vision
model (`@cf/meta/llama-3.2-11b-vision-instruct`) reads it; any event becomes a
proposed memory fact that, once confirmed, lands on the M76 calendar. M81: a
member writes `@claude let's have tacos` and the assistant adds the
ingredients to the shopping list and says what it added.

What went to plan: both features reused the M71–M79 foundation almost
entirely — M80 reuses `parseExtractedFacts` (M78), the propose→confirm loop
(M73), and the calendar (M76); M81 reuses the M55 assistant and the M76
`needs` list. The new surface was small: one vision-model wrapper, one upload
route, one extra model call in the assistant. Factoring `storeProposedFacts`
out of `runExtraction` let the flyer path and the text path share the storing
loop cleanly.

The operator's design correction shaped M80: photographed flyers are not
stored — the image is processed transiently and discarded, so no R2 bucket or
attachments table was needed. The privacy posture matches Gmail ingestion
(M75): raw input in, structured facts out, nothing raw retained.

Nothing remains in this plan. A natural future follow-on: the vision model
could read more than flyers (a receipt, a handwritten note), and meal planning
could remember a household's recurring meals — both extensions of the same
two routes, for a future plan.
