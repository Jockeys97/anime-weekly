import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('../lib/tmdb', () => ({ getTMDBTextTranslations: vi.fn() }));
import { getAnimeLocalizedTitles } from '../lib/anime-localized-titles';
import { readRatingsStore } from '../lib/ratings-store';
import { getTMDBTextTranslations } from '../lib/tmdb';
import { animeLanguageAlternates } from '../lib/anime-url';
import { buildAnimeSitemap } from '../lib/seo-sitemap';
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
it('uses real published translations for reciprocal slugs and falls back only when absent', async () => {
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: { 'tv:10': { anilistId: 21, fetchedAt: 1, lastSeenAt: 1 } } });
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([{ iso_639_1: 'en', name: 'Real Title' }, { iso_639_1: 'it', name: 'Titolo reale' }, { iso_639_1: 'fr', name: 'Titre réel' }]);
  const names = await getAnimeLocalizedTitles(21, 'Real Title');
  expect(names).toEqual({ it: 'Titolo reale', en: 'Real Title', fr: 'Titre réel' });
  const base = new URL('https://weeklyanime.com');
  const languages = animeLanguageAlternates(21, 'Real Title', names, base);
  expect(languages).toMatchObject({ it: 'https://weeklyanime.com/anime/21-titolo-reale', fr: 'https://weeklyanime.com/fr/anime/21-titre-reel', de: 'https://weeklyanime.com/de/anime/21-real-title' });
  const entries = buildAnimeSitemap([{ id: 21, name: 'Real Title', localizedNames: names }], base);
  expect(entries.map(entry => entry.url)).toContain(languages.fr);
  expect(entries.every(entry => JSON.stringify(entry.alternates?.languages) === JSON.stringify(languages))).toBe(true);
});
it('never substitutes the merged parent title for a differently named season or fabricates translations', async () => {
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: { 'tv:10': { anilistId: 21, fetchedAt: 1, lastSeenAt: 1 } } });
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([{ iso_639_1: 'en', name: 'Parent' }, { iso_639_1: 'it', name: 'Genitore' }]);
  expect(await getAnimeLocalizedTitles(21, 'Parent Season 3')).toEqual({});
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
  expect(await getAnimeLocalizedTitles(21, 'Real Title')).toEqual({});
});
it('falls back to the default title when the store or translations fail', async () => {
  vi.mocked(readRatingsStore).mockRejectedValue(new Error('Store unavailable'));
  expect(await getAnimeLocalizedTitles(21, 'Real Title')).toEqual({});
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: { 'tv:10': { anilistId: 21, fetchedAt: 1, lastSeenAt: 1 } } });
  vi.mocked(getTMDBTextTranslations).mockRejectedValue(new Error('TMDB not configured'));
  expect(await getAnimeLocalizedTitles(21, 'Real Title')).toEqual({});
});


it('bounds the complete title lookup when cache and translation waits are sequential', async () => {
  vi.useFakeTimers();
  vi.mocked(readRatingsStore).mockImplementation(() => new Promise(resolve => {
    setTimeout(() => resolve({ ratings: {}, sources: { 'tv:10': { anilistId: 21, fetchedAt: 1, lastSeenAt: 1 } } }), 2000);
  }));
  vi.mocked(getTMDBTextTranslations).mockReturnValue(new Promise(() => {}));
  const pending = getAnimeLocalizedTitles(21, 'Real Title');
  await vi.advanceTimersByTimeAsync(2500);
  expect(await pending).toEqual({});
  expect(getTMDBTextTranslations).toHaveBeenCalledTimes(1);
});
