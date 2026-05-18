import { describe, it, expect } from 'vitest';
import { parseSuggestions } from './reply-suggestions';

describe('parseSuggestions', () => {
	it('extracts plain bulleted suggestions', () => {
		expect(parseSuggestions('- Sounds good!\n- On my way.')).toEqual([
			'Sounds good!',
			'On my way.'
		]);
	});

	it('strips a leading number and wrapping quotes', () => {
		expect(parseSuggestions('- 1. "See you then"')).toEqual(['See you then']);
	});

	it('caps the list at `max`', () => {
		const text = '- one\n- two\n- three\n- four';
		expect(parseSuggestions(text)).toEqual(['one', 'two', 'three']);
		expect(parseSuggestions(text, 2)).toEqual(['one', 'two']);
	});

	it('drops duplicates and non-bullet preamble', () => {
		expect(parseSuggestions('Here are some replies:\n- Yes\n- Yes\n- No')).toEqual(['Yes', 'No']);
	});

	it('returns nothing for text with no bullets', () => {
		expect(parseSuggestions('I could not think of any.')).toEqual([]);
		expect(parseSuggestions('')).toEqual([]);
	});
});
