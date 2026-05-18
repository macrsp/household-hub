import { describe, it, expect } from 'vitest';
import { cleanTitle } from './conversation-title';

describe('cleanTitle', () => {
	it('passes a plain title through, trimmed', () => {
		expect(cleanTitle('  Weekend Camping Trip  ')).toBe('Weekend Camping Trip');
	});

	it('strips wrapping quotes and a trailing period', () => {
		expect(cleanTitle('"Dinner Plans."')).toBe('Dinner Plans');
	});

	it('drops a bullet or numbering prefix', () => {
		expect(cleanTitle('- Holiday Shopping')).toBe('Holiday Shopping');
		expect(cleanTitle('1. Soccer Carpool')).toBe('Soccer Carpool');
	});

	it('uses the first non-empty line', () => {
		expect(cleanTitle('\n\nGarden Project\nsome explanation')).toBe('Garden Project');
	});

	it('caps an over-long title', () => {
		const long = 'A'.repeat(100);
		expect(cleanTitle(long).length).toBe(60);
		expect(cleanTitle(long, 10).length).toBe(10);
	});

	it('returns an empty string for empty input', () => {
		expect(cleanTitle('')).toBe('');
		expect(cleanTitle('   \n  ')).toBe('');
	});
});
