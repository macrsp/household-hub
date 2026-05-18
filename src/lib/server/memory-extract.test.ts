import { describe, it, expect } from 'vitest';
import { parseExtractedFacts } from './memory-extract';

describe('parseExtractedFacts', () => {
	it('parses a single subject | predicate | object line', () => {
		expect(parseExtractedFacts('Mia | teacher | Ms. Lee')).toEqual([
			{ subject: 'Mia', predicate: 'teacher', object: 'Ms. Lee' }
		]);
	});

	it('snake_cases a multi-word predicate', () => {
		expect(parseExtractedFacts('the house | wifi password | hunter2')).toEqual([
			{ subject: 'the house', predicate: 'wifi_password', object: 'hunter2' }
		]);
	});

	it('strips a leading bullet or numbering', () => {
		expect(parseExtractedFacts('- the dog | name | Rex\n2. the cat | name | Mochi')).toEqual([
			{ subject: 'the dog', predicate: 'name', object: 'Rex' },
			{ subject: 'the cat', predicate: 'name', object: 'Mochi' }
		]);
	});

	it('drops malformed lines and a NONE reply', () => {
		expect(parseExtractedFacts('NONE')).toEqual([]);
		expect(parseExtractedFacts('just some prose\nMia | teacher | Ms. Lee\ntwo | fields')).toEqual(
			[{ subject: 'Mia', predicate: 'teacher', object: 'Ms. Lee' }]
		);
	});

	it('drops a line with an empty field', () => {
		expect(parseExtractedFacts('Mia |  | Ms. Lee')).toEqual([]);
	});

	it('caps the result at five facts', () => {
		const lines = Array.from({ length: 8 }, (_, i) => `s${i} | p | o${i}`).join('\n');
		expect(parseExtractedFacts(lines)).toHaveLength(5);
	});
});
