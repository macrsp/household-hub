// The declared string sets for the household memory graph (M71). This module
// is the single source of truth: both the server validators (the typed insert
// helpers in db.ts) and any client code import these — no validator may keep
// a hand-maintained copy. See .agent/household-memory.md and PLANS.md
// invariant three.

// The kinds of node the memory graph holds.
export const ENTITY_KINDS = ['person', 'pet', 'place', 'org', 'thing', 'event'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

// Where a fact came from: stated explicitly by a member, extracted by the AI
// from a hub conversation, from a connected email account, or from a
// photographed flyer (M80).
export const FACT_SOURCES = ['explicit', 'conversation', 'email', 'flyer'] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export function isEntityKind(value: unknown): value is EntityKind {
	return typeof value === 'string' && (ENTITY_KINDS as readonly string[]).includes(value);
}

export function isFactSource(value: unknown): value is FactSource {
	return typeof value === 'string' && (FACT_SOURCES as readonly string[]).includes(value);
}
