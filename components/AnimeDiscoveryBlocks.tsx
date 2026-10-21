import Link from 'next/link';
import { animeName, type AniListAnime } from '@/lib/anilist';
import { animePath } from '@/lib/anime-url';
import { getSimilarAnime } from '@/lib/discovery-data';
import { getRankingsWeek } from '@/lib/rankings-seo-data';
import { fill, similarPath } from '@/lib/discovery';
import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';
import { localePath } from '@/lib/locale-routing';
import { withTimeout } from '@/lib/async-timeout';

export async function AnimeSimilarBlock({ anime, name, locale }: { anime: AniListAnime; name: string; locale: Locale }) {
  const items = await withTimeout(getSimilarAnime(anime), 5000).catch(() => []);
  if (!items.length) return null;
  const d = getDictionary(locale).discovery;
  return <section className="landing-day"><h2>{d.similar}</h2><ol className="landing-list">
    {items.slice(0, 6).map(({ anime }) => <li key={anime.id}><Link href={localePath(animePath(anime.id, animeName(anime)), locale)}>{animeName(anime)}</Link>{anime.genres.length ? ` · ${anime.genres.join(', ')}` : ''}</li>)}
  </ol>{items.length >= 5 && <Link href={localePath(similarPath(anime.id, name), locale)}>{d.allSimilar}</Link>}</section>;
}
export async function AnimeCurrentRanking({ id, locale }: { id: number; locale: Locale }) {
  const data = await withTimeout(getRankingsWeek('this-week'), 5000).catch(() => null);
  if (!data) return null;
  const appearances = (['imdb', 'mal'] as const).flatMap(source => {
    const index = data.rankings[source].findIndex(entry => entry.anilistId === id);
    return index < 0 ? [] : [{ source, rank: index + 1 }];
  });
  if (!appearances.length) return null;
  const d = getDictionary(locale).discovery;
  return <section className="landing-day"><h2>{d.ranking}</h2><ul>{appearances.map(({ source, rank }) => <li key={source}>
    <Link href={localePath(`/rankings/this-week#ranking-${source}`, locale)}>{fill(d.position, { source: source === 'imdb' ? 'IMDb' : 'MyAnimeList', rank, week: data.week })}</Link>
  </li>)}</ul></section>;
}
