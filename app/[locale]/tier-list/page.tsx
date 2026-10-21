import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from '@/components/LocaleLink';
import { TierListMaker } from '@/components/TierListMaker';
import { animeName, getSeason, type AniListAnime } from '@/lib/anilist';
import { withTimeout } from '@/lib/async-timeout';
import { getDictionary } from '@/lib/i18n';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { currentSeason, seasonPath, shiftSeason } from '@/lib/season';
import { pageMetadata, siteUrl } from '@/lib/seo';
import { localePath } from '@/lib/locale-routing';
import { snapshotCatalog } from '@/lib/snapshot-catalog';
import { getTmdbTitleCard } from '@/lib/tmdb';
import { tierListPath, tierSeasonFromQuery, type TierItem } from '@/lib/tier-list';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';

type Query = Promise<{ season?: string | string[]; year?: string | string[] }>;
const MAX_PAGES = 4;

export async function generateMetadata({ params }: { params?: LocaleParams }): Promise<Metadata> {
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale).tierList;
  return pageMetadata(d.title, d.description, '/tier-list', undefined, locale);
}

// TMDB posters where the weekly snapshot already confirms the AniList identity,
// otherwise the AniList cover. No title searches: one cached TMDB detail per match.
async function tmdbPosters(media: AniListAnime[]): Promise<Map<number, string>> {
  const posters = new Map<number, string>();
  try {
    const summaries = snapshotCatalog(await withTimeout(readWeeklyRatingsSnapshot(formatWeek(isoWeek(new Date()))), 4000));
    await withTimeout(Promise.all(media.map(async anime => {
      const match = summaries[anime.id]?.availability.match;
      if (!match) return;
      const card = await getTmdbTitleCard(match.kind, match.id);
      if (card?.poster) posters.set(anime.id, card.poster);
    })), 8000);
  } catch { /* AniList covers are a complete fallback. */ }
  return posters;
}

export default async function TierListPage({ params, searchParams }: { params?: LocaleParams; searchParams: Query }) {
  await connection();
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale); const t = d.tierList;
  const query = await searchParams;
  const season = tierSeasonFromQuery(query.season, query.year, currentSeason());
  const media: AniListAnime[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getSeason(season.year, season.season, page);
    media.push(...data.media);
    if (!data.pageInfo.hasNextPage || !data.media.length) break;
  }
  const posters = await tmdbPosters(media);
  const seen = new Set<number>();
  const items: TierItem[] = media.filter(anime => !seen.has(anime.id) && Boolean(seen.add(anime.id))).map(anime => ({
    id: anime.id, name: animeName(anime),
    poster: posters.get(anime.id) ?? anime.coverImage?.extraLarge ?? anime.coverImage?.large ?? null,
  }));
  const seasonName = d.catalog.seasonNames[season.season];
  const previous = shiftSeason(season, -1); const next = shiftSeason(season, 1);
  return <main id="main" className="catalog-page tier-page" lang={locale}>
    <h1>{t.heading.replace('{season}', seasonName).replace('{year}', String(season.year))}</h1>
    <p className="catalog-intro">{t.intro}</p>
    <nav className="catalog-filters" aria-label={d.catalog.seasonLabel}>
      <Link prefetch={false} href={tierListPath(previous)} aria-label={d.catalog.previousSeason}>← {d.catalog.seasonNames[previous.season]} {previous.year}</Link>
      <Link prefetch={false} href={tierListPath(currentSeason())}>{d.catalog.currentSeason}</Link>
      <Link prefetch={false} href={tierListPath(next)} aria-label={d.catalog.nextSeason}>{d.catalog.seasonNames[next.season]} {next.year} →</Link>
      <Link prefetch={false} href={seasonPath(season)}>{d.catalog.seasonTitle} · {seasonName} {season.year}</Link>
    </nav>
    {items.length ? <TierListMaker key={`${season.year}-${season.season}`} locale={locale} season={season} seasonName={seasonName} items={items}
      shareUrl={new URL(localePath(tierListPath(season), locale), siteUrl()).href} />
      : <div className="empty-state" role="status"><p>{t.empty}</p></div>}
  </main>;
}
