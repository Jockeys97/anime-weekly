import type { AniListAnime } from '@/lib/anilist';
import type { AnimeTitle } from '@/lib/tmdb';

// Explicit identities for titles which providers index separately from their
// franchise. Never infer them from a broad substring such as "JoJo".
// Verified 2026-10-14 against the title-specific official pages:
// https://www.imdb.com/title/tt38268282/
// https://www.netflix.com/it/title/82116553
// https://www.netflix.com/title/82116553
// Netflix lists both stages as seasons of this title. Only the independently
// checked countries below are supplied; no worldwide availability is assumed.
export function getVerifiedTitleLinks(anime: Pick<AniListAnime, 'id' | 'format' | 'startDate'>): {
  title: string; imdbId: string; providers: AnimeTitle['providers'];
} | null {
  if (![190327, 210482].includes(anime.id) || anime.format !== 'ONA' || anime.startDate?.year !== 2026) return null;
  const offer = (link: string) => ({ link, providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null, watch_url: link }] });
  return {
    title: "Steel Ball Run: JoJo's Bizarre Adventure", imdbId: 'tt38268282',
    providers: { IT: offer('https://www.netflix.com/it/title/82116553'), US: offer('https://www.netflix.com/title/82116553') },
  };
}
