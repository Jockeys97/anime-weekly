import type { AniListAnime } from '@/lib/anilist';
import { displayTitle } from '@/lib/title-text';

const clean = (value: string) => displayTitle(value).replace(/\s+/g, ' ').trim();
const identity = (value: string) => clean(value).normalize('NFKC').toLowerCase();

// Keep published English, romaji and Japanese names in that order. Share the
// same comparison across visible subtitles, metadata and structured data.
export function animeAlternateNames(name: string, titles: AniListAnime['title']): string[] {
  const seen = new Set([identity(name)]);
  return [titles.english, titles.romaji, titles.native].flatMap(value => {
    if (!value?.trim()) return [];
    const title = clean(value);
    const key = identity(title);
    if (seen.has(key)) return [];
    seen.add(key);
    return [title];
  });
}
