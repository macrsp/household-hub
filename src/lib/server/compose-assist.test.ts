import { describe, it, expect } from 'vitest';
import { cleanRewrite } from './compose-assist';

describe('cleanRewrite', () => {
	it('passes a plain rewrite through, trimmed', () => {
		expect(cleanRewrite('  Could you pick up milk on your way home?  ')).toBe(
			'Could you pick up milk on your way home?'
		);
	});

	it('drops a short preamble line ending in a colon', () => {
		const text = 'Here is a polished version:\nCould you pick up milk?';
		expect(cleanRewrite(text)).toBe('Could you pick up milk?');
	});

	it('strips wrapping quotes', () => {
		expect(cleanRewrite('"See you at six!"')).toBe('See you at six!');
	});

	it('keeps a colon line when it is the only content', () => {
		expect(cleanRewrite('Reminder: take out the bins')).toBe('Reminder: take out the bins');
	});

	it('keeps multi-line body text intact', () => {
		expect(cleanRewrite('First line.\nSecond line.')).toBe('First line.\nSecond line.');
	});
});
