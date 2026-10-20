import { animeName, getFavoriteAnime, type AniListAnime } from '@/lib/anilist';
import { animePath } from '@/lib/anime-url';
import { favoriteIds, type FavoriteItem } from '@/lib/favorites';
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
  const items: FavoriteItem[] = [
    ...anime.media.map(media => {
      const name = animeName(media as AniListAnime);
      const next = media.nextAiringEpisode && Number.isSafeInteger(media.nextAiringEpisode.episode) && Number.isSafeInteger(media.nextAiringEpisode.airingAt) ? media.nextAiringEpisode : undefined;
      return { id: `anilist:${media.id}`, name, poster: media.coverImage?.large || media.coverImage?.extraLarge || null, href: animePath(media.id, name),
        ...(media.status ? { status: media.status as FavoriteItem['status'] } : {}), ...(next ? { next: { episode: next.episode, airingAt: next.airingAt } } : {}) };
    }),
    ...cards.filter((card): card is NonNullable<typeof card> => card !== null),
  ];
  const unavailable = anime.unavailable || cards.some(card => card === null);
  return Response.json({ items, unavailable }, { headers: { 'Cache-Control': anime.unavailable ? 'no-store' : 'public, max-age=300, s-maxage=600' } });
}
