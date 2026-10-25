import type { AniListAnime } from '@/lib/anilist';
import { displayTitle } from '@/lib/title-text';

const clean = (value: string) => displayTitle(value).replace(/\s+/g, ' ').trim();
const identity = (value: string) => clean(value).normalize('NFKC').toLowerCase();

// Keep published English, romaji and Japanese names in that order. Share the
// same comparison across visible subtitles, metadata and structured data.
export function animeAlternateNames(name: string, titles: AniListAnime['title'], synonyms?: AniListAnime['synonyms']): string[] {
  const seen = new Set([identity(name)]);
  const alternateNames = [titles.english, titles.romaji, titles.native].flatMap(value => {
    if (!value?.trim()) return [];
    const title = clean(value);
    const key = identity(title);
    if (seen.has(key)) return [];
    seen.add(key);
    return [title];
  });
  for (const value of synonyms || []) {
    const title = clean(value);
    if (title && !seen.has(identity(title))) {
      seen.add(identity(title));
      alternateNames.push(title);
    }
  }
  return alternateNames;
}
