import { describe, expect, it } from 'vitest';
import { formatAnimeScore, formatMembers, formatRating, formatVotes } from '../lib/ratings';
describe('source ratings', () => {
  it.each([undefined, null, '', ' ', 'N/A', 'bad', -1, 11, NaN])('formats missing or invalid %s as n/a', value => expect(formatRating(value)).toBe('n/a'));
  it('preserves real IMDb values', () => { expect(formatRating('8.4')).toBe('8.4'); expect(formatRating('0')).toBe('0'); });
  it('formats actual vote counts', () => { expect(formatVotes('12,345')).toBe('12,345'); expect(formatVotes('1234')).toBe('1,234'); expect(formatVotes('0')).toBe('0'); });
  it.each([undefined, null, 'N/A', '', '12,34', '-1', '4.5'])('does not invent votes for %s', value => expect(formatVotes(value)).toBe('n/a'));
});

describe('anime score formatting', () => {
  it('prefers MAL with two decimals and compact members', () => {
    expect(formatAnimeScore({ malScore: 8.12, malMembers: 1200000, anilistScore: 81 })).toBe('MAL 8.12 · 1.2M members');
    expect(formatAnimeScore({ malScore: 8.1, malMembers: 12345 })).toBe('MAL 8.10 · 12.3K members');
  });
  it('omits unavailable members without inventing a count', () => {
    expect(formatAnimeScore({ malScore: 8, malMembers: null })).toBe('MAL 8.00');
    expect(formatAnimeScore({ malScore: 0, malMembers: 0 })).toBe('MAL 0.00 · 0 members');
  });
  it('falls back to an actual AniList average', () => {
    expect(formatAnimeScore({ malScore: null, anilistScore: 81 })).toBe('AniList 81%');
    expect(formatAnimeScore({ malScore: NaN, anilistScore: 81 })).toBe('AniList 81%');
    expect(formatAnimeScore({ anilistScore: 0 })).toBe('AniList 0%');
  });
  it.each([undefined, null, -1, 11, NaN, Infinity])('rejects invalid MAL score %s', malScore => {
    expect(formatAnimeScore({ malScore })).toBe('n/a');
  });
  it.each([undefined, null, -1, 101, NaN, Infinity])('rejects invalid AniList score %s', anilistScore => {
    expect(formatAnimeScore({ anilistScore })).toBe('n/a');
  });
  it.each([undefined, null, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid member count %s', value => {
    expect(formatMembers(value)).toBe('n/a');
  });
});
