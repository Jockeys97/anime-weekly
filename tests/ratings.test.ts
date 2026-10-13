import { describe, expect, it } from 'vitest';
import { formatRating, formatVotes } from '../lib/ratings';
describe('source ratings', () => {
  it.each([undefined, null, '', ' ', 'N/A', 'bad', -1, 11, NaN])('formats missing or invalid %s as n/a', value => expect(formatRating(value)).toBe('n/a'));
  it('preserves real IMDb and Metascore values', () => { expect(formatRating('8.4')).toBe('8.4'); expect(formatRating('82', 100)).toBe('82'); expect(formatRating('0')).toBe('0'); });
  it('formats actual vote counts', () => { expect(formatVotes('12,345')).toBe('12,345'); expect(formatVotes('1234')).toBe('1,234'); expect(formatVotes('0')).toBe('0'); });
  it.each([undefined, null, 'N/A', '', '12,34', '-1', '4.5'])('does not invent votes for %s', value => expect(formatVotes(value)).toBe('n/a'));
});
