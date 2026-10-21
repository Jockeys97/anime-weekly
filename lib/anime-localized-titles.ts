import 'server-only';
import { cache } from 'react';
import { animeSlug } from '@/lib/anime-url';
import { readRatingsStore } from '@/lib/ratings-store';
import { getTMDBTextTranslations } from '@/lib/tmdb';
import { locales, tmdbLanguages, type Locale } from '@/lib/locales';
import { withTimeout } from '@/lib/async-timeout';

const sources = cache(readRatingsStore);
// Published translations only. TMDB can merge several seasons: require its
// English title to match the exact AniList work before using translated slugs.
// No mapping/translation means the real AniList title remains the fallback.
export const getAnimeLocalizedTitles = cache(async (id: number, name: string): Promise<Partial<Record<Locale, string>>> => {
  try {
    const store = await sources();
    const key = Object.keys(store.sources).find(key => store.sources[key].anilistId === id && /^(tv|movie):[1-9]\d*$/.test(key));
    if (!key) return {};
    const [kind, tmdbId] = key.split(':');
    const translations = await withTimeout(getTMDBTextTranslations(Number(tmdbId), kind as 'tv' | 'movie'), 2500);
    if (!translations.some(entry => entry.iso_639_1 === 'en' && entry.name && animeSlug(entry.name) === animeSlug(name))) return {};
    return Object.fromEntries(locales.flatMap(locale => {
      const country = tmdbLanguages[locale].split('-')[1];
      const entries = translations.filter(entry => entry.iso_639_1 === locale && entry.name?.trim() && animeSlug(entry.name));
      const entry = entries.find(entry => entry.iso_3166_1 === country) ?? entries[0];
      return entry ? [[locale, entry.name!.trim()]] : [];
    }));
  } catch { return {}; }
});
