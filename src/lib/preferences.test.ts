import { describe, it, expect } from 'vitest';
import { DELIVERY_PREFERENCES, isDeliveryPreference } from './preferences';

// Enumerates the declared delivery-preference set and asserts the gate
// (isDeliveryPreference) accepts each entry — so adding or renaming a
// preference without updating the gate fails the build. PLANS.md
// User-Asset Write-Path Checklist, item 3.
describe('delivery preferences', () => {
	for (const pref of DELIVERY_PREFERENCES) {
		it(`isDeliveryPreference accepts declared value '${pref}'`, () => {
			expect(isDeliveryPreference(pref)).toBe(true);
		});
	}

	it('rejects an undeclared value', () => {
		expect(isDeliveryPreference('weekly-digest')).toBe(false);
	});

	it('rejects non-string values', () => {
		expect(isDeliveryPreference(1)).toBe(false);
		expect(isDeliveryPreference(null)).toBe(false);
		expect(isDeliveryPreference(undefined)).toBe(false);
	});
});
