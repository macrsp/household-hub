import { describe, it, expect } from 'vitest';
import { resolveLanguage } from './translate';

describe('resolveLanguage', () => {
	it('returns a supported language unchanged', () => {
		expect(resolveLanguage('Spanish')).toBe('Spanish');
	});

	it('matches case-insensitively', () => {
		expect(resolveLanguage('french')).toBe('French');
		expect(resolveLanguage('  ARABIC  ')).toBe('Arabic');
	});

	it('falls back to English for an unknown language', () => {
		expect(resolveLanguage('Klingon')).toBe('English');
	});

	it('falls back to English for a non-string', () => {
		expect(resolveLanguage(undefined)).toBe('English');
		expect(resolveLanguage(42)).toBe('English');
		expect(resolveLanguage(null)).toBe('English');
	});
});
