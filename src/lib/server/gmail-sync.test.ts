import { describe, it, expect } from 'vitest';
import { syncAllAccounts } from './gmail-sync';

describe('syncAllAccounts', () => {
	it('sums the proposed counts across accounts', async () => {
		const result = await syncAllAccounts(['a', 'b', 'c'], async () => 2);
		expect(result).toEqual({ ok: 3, failed: 0, proposed: 6 });
	});

	it('isolates a failing account — the others still sync (PLANS.md invariant 2)', async () => {
		const seen: string[] = [];
		const result = await syncAllAccounts(['a', 'b', 'c'], async (acct) => {
			seen.push(acct);
			if (acct === 'a') throw new Error('account a is broken');
			return 1;
		});
		// 'a' threw, but 'b' and 'c' were still attempted and counted.
		expect(seen).toEqual(['a', 'b', 'c']);
		expect(result).toEqual({ ok: 2, failed: 1, proposed: 2 });
	});

	it('is a clean no-op for no accounts', async () => {
		expect(await syncAllAccounts([], async () => 1)).toEqual({
			ok: 0,
			failed: 0,
			proposed: 0
		});
	});
});
