// A participant's per-conversation delivery preference. Single source of truth
// (PLANS.md User-Asset Durability invariant 3) — this module has no server-only
// dependencies, so the server validator AND the web UI both import this set.
//
//   'all'      — push a message to every one of the person's endpoints.
//   'app_only' — keep the person in the conversation but send them no SMS;
//                they read via the polling web app.
export const DELIVERY_PREFERENCES = ['all', 'app_only'] as const;

export type DeliveryPreference = (typeof DELIVERY_PREFERENCES)[number];

/** Type guard — the one accepted-set gate for `delivery_preference`. */
export function isDeliveryPreference(x: unknown): x is DeliveryPreference {
	return typeof x === 'string' && (DELIVERY_PREFERENCES as readonly string[]).includes(x);
}
