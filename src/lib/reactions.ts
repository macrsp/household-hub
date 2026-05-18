// The set of emoji a household member can react to a message with (M36).
//
// This is the single source of truth for the reaction set, shared by the
// client (the picker UI) and the server (the validator in the reactions
// route). Per .agent/PLANS.md User-Asset Durability invariant 3, the server
// must not re-spell this set; it imports `isReactionEmoji` from here. The
// `reactions` table stores the emoji as free text with no CHECK constraint,
// so there is no schema copy of the set to drift out of sync.

export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

/** Whether `value` is one of the accepted reaction emoji. */
export function isReactionEmoji(value: unknown): value is ReactionEmoji {
	return typeof value === 'string' && (REACTION_EMOJI as readonly string[]).includes(value);
}
