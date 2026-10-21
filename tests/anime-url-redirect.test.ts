vi.mock('../lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anilist', async original => ({ ...await original<typeof import('../lib/anilist')>(), getAnime: vi.fn() }));
vi.mock('../lib/anime-detail-data', () => ({ getAnimeDetailData: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { getAnimeDetailData } from '../lib/anime-detail-data';
import { generateMetadata } from '../app/[locale]/anime/[id]/page';

afterEach(() => vi.clearAllMocks());

// Bare IDs and stale slugs render in place (ISR-safe) and declare the slug URL canonical.
it.each(['it', 'en', 'es', 'fr', 'de', 'pt'])('canonicalizes bare and stale slugs to the title slug in %s', async locale => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com');
  vi.mocked(getAnime).mockResolvedValue({ id: 1535, title: { english: 'Death Note', romaji: null, native: null }, genres: [] } as unknown as NonNullable<Awaited<ReturnType<typeof getAnime>>>);
  vi.mocked(getAnimeDetailData).mockResolvedValue({ synopsis: { synopsis: '', language: locale, source: 'none' }, availability: null, ratings: null } as unknown as Awaited<ReturnType<typeof getAnimeDetailData>>);
  for (const id of ['1535', '1535-old-title', '1535-death-note']) {
    const metadata = await generateMetadata({ params: Promise.resolve({ id, locale }) });
    expect(metadata.alternates?.canonical).toBe(`https://weeklyanime.com${locale === 'it' ? '' : `/${locale}`}/anime/1535-death-note`);
  }
  expect(getAnime).toHaveBeenCalledWith(1535);
});
