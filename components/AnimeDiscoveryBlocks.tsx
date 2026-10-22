import Link from 'next/link';
import { animeName, type AniListAnime } from '@/lib/anilist';
import { animePath } from '@/lib/anime-url';
import { getSimilarAnime, getAiringThisWeekAnime } from '@/lib/discovery-data';
import { LandingCard } from '@/components/LandingCard';
import { getRankingsWeek } from '@/lib/rankings-seo-data';
import { fill, similarPath } from '@/lib/discovery';
import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';
import { localePath } from '@/lib/locale-routing';
import { withTimeout } from '@/lib/async-timeout';

export async function AnimeSimilarBlock({ anime, name, locale }: { anime: AniListAnime; name: string; locale: Locale }) {
  const items = await withTimeout(getSimilarAnime(anime), 5000).catch(() => []);
  if (items.length < 4) return null;
  const d = getDictionary(locale).discovery;
  return <section className="landing-day detail-discovery" aria-labelledby="similar-anime-heading"><h2 id="similar-anime-heading">{d.similar}</h2>
    <DiscoveryCards items={items.slice(0, 6).map(item => item.anime)} locale={locale} />
    <Link prefetch={false} href={localePath(similarPath(anime.id, name), locale)}>{d.allSimilar} →</Link></section>;
}

export async function AnimeAiringThisWeekBlock({ id, locale }: { id: number; locale: Locale }) {
  const items = await withTimeout(getAiringThisWeekAnime(), 5000).catch(() => []);
  const others = items.filter(anime => anime.id !== id).slice(0, 4);
  if (!others.length) return null;
  const d = getDictionary(locale).discovery;
  return <section className="landing-day detail-discovery" aria-labelledby="airing-this-week-heading"><h2 id="airing-this-week-heading">{d.airingThisWeek}</h2>
    <DiscoveryCards items={others} locale={locale} />
    <Link prefetch={false} href={localePath('/this-week', locale)}>{d.allThisWeek} →</Link></section>;
}

function DiscoveryCards({ items, locale }: { items: AniListAnime[]; locale: Locale }) {
  return <ul className="landing-list detail-discovery-cards">{items.map(anime => <li key={anime.id}>
    <LandingCard locale={locale} href={localePath(animePath(anime.id, animeName(anime)), locale)} name={animeName(anime)}
      poster={anime.coverImage?.large || anime.coverImage?.extraLarge || null} compact
      ratings={anime.genres.join(' · ')} primary={null} others={[]} />
  </li>)}</ul>;
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
