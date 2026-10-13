import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Locale } from '@/lib/locales';
import { getLocalizedSynopsis } from '@/lib/tmdb';
import { animeDescription, getAnime } from '@/lib/anilist';
import { isDeepLConfigured, translateSynopsis } from '@/lib/deepl';
import type { SynopsisResult } from '@/lib/synopsis-client';
class MissingSynopsis extends Error {}
const resolveSynopsis = unstable_cache(async (titles: string[], year: number | undefined, locale: Locale, kind: 'tv' | 'movie', id?: number): Promise<SynopsisResult> => {
  let synopsis = await getLocalizedSynopsis(titles, year, locale, kind);
  let source: 'tmdb' | 'deepl' | null = synopsis ? 'tmdb' : null;
  if (!synopsis && id != null && locale !== 'en' && isDeepLConfigured()) {
    // Fetch the English source by its canonical AniList ID. Never accept text
    // submitted by a client, or infer a season's synopsis from its parent show.
    const anime = await getAnime(id);
    const original = anime ? animeDescription(anime.description) : '';
    if (original) {
      synopsis = await translateSynopsis(original, locale);
      if (synopsis) source = 'deepl';
    }
  }
  if (!synopsis) throw new MissingSynopsis();
  return { synopsis: animeDescription(synopsis), language: locale, source };
}, ['resolved-synopsis-v1'], { revalidate: 86400, tags: ['anime-week', 'machine-synopses'] });
export async function getSynopsis(titles: string[], year: number | undefined, locale: Locale, kind: 'tv' | 'movie', id?: number): Promise<SynopsisResult> {
  if (locale === 'en') return { synopsis: null, language: null, source: null };
  try { return await resolveSynopsis(titles, year, locale, kind, id); }
  catch (error) {
    if (error instanceof MissingSynopsis) return { synopsis: null, language: null, source: null };
    throw error;
  }
}
