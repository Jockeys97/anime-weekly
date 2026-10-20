import { animeName, getFavoriteAnime, type AniListAnime, type FavoriteAnime } from '@/lib/anilist';
import { animePath } from '@/lib/anime-url';
import { activeSequel, favoriteIds, missingSequelIds, SEQUEL_HOPS, type FavoriteItem } from '@/lib/favorites';
import { getTmdbTitleCard } from '@/lib/tmdb';

// The list itself lives in the visitor's browser; this only resolves its ids to
// cards. Short edge cache: the next-episode times change through the season.
export async function GET(request: Request) {
  const ids = favoriteIds(new URL(request.url).searchParams.get('ids'));
  if (!ids.length) return Response.json({ items: [], unavailable: false });
  const anilist = ids.filter(id => id.startsWith('anilist:')).map(id => Number(id.slice(8)));
  const tmdb = ids.filter(id => !id.startsWith('anilist:')).slice(0, 30);
  const [anime, cards] = await Promise.all([
    anilist.length ? getFavoriteAnime(anilist) : Promise.resolve({ media: [], unavailable: false }),
    Promise.all(tmdb.map(async id => {
      const [kind, value] = id.split(':') as ['tv' | 'movie', string];
      const card = await getTmdbTitleCard(kind, Number(value));
      return card ? { id, name: card.name, poster: card.poster, href: `/search?${new URLSearchParams({ q: card.name })}` } satisfies FavoriteItem : null;
    })),
  ]);
  // Walk finished favourites to their airing sequel, one batched request per hop.
  const lookup = new Map<number, FavoriteAnime>(anime.media.map(media => [media.id, media]));
  let sequelsUnavailable = false;
  for (let hop = 0; hop < SEQUEL_HOPS; hop++) {
    const missing = [...new Set(anime.media.flatMap(media => missingSequelIds(media, lookup)))].filter(id => !lookup.has(id));
    if (!missing.length) break;
    const more = await getFavoriteAnime(missing);
    for (const media of more.media) lookup.set(media.id, media);
    if (more.unavailable) { sequelsUnavailable = true; break; }
  }
  const validNext = (next: FavoriteAnime['nextAiringEpisode']) => next && Number.isSafeInteger(next.episode) && Number.isSafeInteger(next.airingAt) ? { episode: next.episode, airingAt: next.airingAt } : undefined;
  const items: FavoriteItem[] = [
    ...anime.media.map(media => {
      const name = animeName(media as AniListAnime);
      const sequel = activeSequel(media, lookup);
      // The card keeps the saved cover and name; status, next episode and link follow the airing season.
      const target = sequel ?? media;
      const targetName = sequel ? animeName(sequel as AniListAnime) : name;
      const next = validNext(target.nextAiringEpisode);
      return { id: `anilist:${media.id}`, name, poster: media.coverImage?.large || media.coverImage?.extraLarge || null, href: animePath(target.id, targetName),
        ...(target.status ? { status: target.status as FavoriteItem['status'] } : {}), ...(next ? { next } : {}), ...(sequel ? { current: targetName } : {}) };
    }),
    ...cards.filter((card): card is NonNullable<typeof card> => card !== null),
  ];
  const unavailable = anime.unavailable || sequelsUnavailable || cards.some(card => card === null);
  return Response.json({ items, unavailable }, { headers: { 'Cache-Control': anime.unavailable ? 'no-store' : 'public, max-age=300, s-maxage=600' } });
}
