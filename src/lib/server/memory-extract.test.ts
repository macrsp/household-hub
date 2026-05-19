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

	it('captures a YYYY-MM-DD date from a fourth field (M78)', () => {
		expect(parseExtractedFacts('school | field_trip | the zoo | 2026-06-02')).toEqual([
			{ subject: 'school', predicate: 'field_trip', object: 'the zoo', date: '2026-06-02' }
		]);
	});

	it('captures a date with a time (M78)', () => {
		expect(parseExtractedFacts('Mia | dentist | checkup | 2026-06-02 14:30')).toEqual([
			{ subject: 'Mia', predicate: 'dentist', object: 'checkup', date: '2026-06-02 14:30' }
		]);
	});

	it('ignores a fourth field that carries no date (M78)', () => {
		expect(parseExtractedFacts('Mia | teacher | Ms. Lee | sometime soon')).toEqual([
			{ subject: 'Mia', predicate: 'teacher', object: 'Ms. Lee' }
		]);
	});

	it('drops a line with five fields (M78)', () => {
		expect(parseExtractedFacts('a | b | c | 2026-06-02 | extra')).toEqual([]);
	});
});
