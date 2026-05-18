import { describe, it, expect } from 'vitest';
import { parseActions } from './action-items';

describe('parseActions', () => {
	it('extracts a plain bulleted item', () => {
		expect(parseActions('- buy milk')).toEqual([{ assignee: '', task: 'buy milk' }]);
	});

	it('reads a [Name] assignee prefix', () => {
		expect(parseActions('- [Sam] book the dentist')).toEqual([
			{ assignee: 'Sam', task: 'book the dentist' }
		]);
	});

	it('keeps multiple items and drops non-bullet preamble', () => {
		const text = 'Here are the to-dos:\n- [Mum] pick up the car\n- water the plants\n';
		expect(parseActions(text)).toEqual([
			{ assignee: 'Mum', task: 'pick up the car' },
			{ assignee: '', task: 'water the plants' }
		]);
	});

	it('accepts a "*" bullet and trims whitespace', () => {
		expect(parseActions('  *   call grandma  ')).toEqual([{ assignee: '', task: 'call grandma' }]);
	});

	it('drops a bullet with an empty task', () => {
		expect(parseActions('- \n- [Sam] ')).toEqual([]);
	});

	it('returns nothing for text with no bullets', () => {
		expect(parseActions('No action items were found.')).toEqual([]);
		expect(parseActions('')).toEqual([]);
	});
});
