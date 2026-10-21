import Link from '@/components/LocaleLink';
import { JsonLd } from '@/components/JsonLd';
import { LandingCard } from '@/components/LandingCard';
import { landingProvidersFromTitle } from '@/lib/landing-providers';
import { getAnimePlatformMetadata } from '@/lib/platform-metadata';
import { animeName, getSeason, type AniListAnime } from '@/lib/anilist';
import { getGenreLists } from '@/lib/discovery-data';
import { genrePath } from '@/lib/discovery';
import { animePath } from '@/lib/anime-url';
import { getDictionary } from '@/lib/i18n';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { currentSeason, seasonPath } from '@/lib/season';
import { landingHeading, landingMetadata, rankSeason } from '@/lib/seo-landings';
import { animeItemList, breadcrumbList } from '@/lib/structured-data';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';

export const revalidate = 86400;
export const dynamic = 'error';
export async function generateMetadata({ params }: { params?: LocaleParams }) {
  return landingMetadata('best', await getRequestLocale(params));
}
export default async function BestThisSeason({ params }: { params?: LocaleParams }) {
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale); const now = new Date(); const season = currentSeason(now);
  // Read the shared snapshot directly: the full guide’s 15-minute endpoint
  // fetch would shorten this page’s daily ISR interval. A cold cache is fine.
  const snapshot = await readWeeklyRatingsSnapshot(formatWeek(isoWeek(now)));
  const cached = Object.fromEntries(Object.values(snapshot.titles).filter(rating => rating.anilistId).map(rating => [rating.anilistId!, rating]));
  const media: AniListAnime[] = [];
  // Read every cached catalog page before ranking; popularity pagination alone
  // must not exclude a highly rated title beyond the first 50 catalog entries.
  for (let page = 1; ; page++) {
    const data = await getSeason(season.year, season.season, page);
    media.push(...data.media);
    if (!data.pageInfo.hasNextPage || !data.media.length) break;
  }
  const ranked = rankSeason(media, cached);
  const genreLists = await getGenreLists().catch(() => null);
  // The weekly snapshot only covers this week's TMDB titles (and is empty when cold), so
  // look up real TMDB watch providers per ranked AniList title; cached per title for 1h.
  const platforms = ranked.length ? await getAnimePlatformMetadata(ranked.map(({ anime }) => anime)) : { titles: {}, unavailable: false };
  const heading = landingHeading('best', locale, now);
  const format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <main id="main" className="catalog-page" lang={locale}>
    <JsonLd data={animeItemList(ranked.map(({ anime }) => ({ name: animeName(anime), anilistId: anime.id })), locale, { name: heading, path: "/best-this-season" })} />
    <JsonLd data={breadcrumbList([{ name: d.landings.home, path: '/' }, { name: heading, path: '/best-this-season' }], locale)} />
    <h1>{heading}</h1><p className="catalog-intro">{d.landings.bestDescription}</p><p className="notice">{d.landings.rankingRule}</p>
    <nav className="catalog-filters"><Link href={seasonPath(season)}>{d.catalog.seasonTitle}</Link><Link href="/">{d.landings.home}</Link><Link href="/this-week">{d.landings.weekNav}</Link></nav>
    {genreLists && <nav className="catalog-filters" aria-label={d.catalog.genres}>{genreLists.lists.filter(list => list.items.length > 0).map(list => <Link key={list.genre} href={genrePath(list.genre)}>{list.genre} ({list.items.length})</Link>)}</nav>}
    {ranked.length ? <ol className="landing-list">{ranked.map(({ anime, score, sources }, index) => { const meta = platforms.titles[`anilist:${anime.id}`]; const { primary, others } = landingProvidersFromTitle(meta?.providersUnavailable ? undefined : (Object.keys(meta?.providers ?? {}).length ? meta?.providers : meta?.seriesWatch?.providers), locale); return <li key={anime.id}><LandingCard locale={locale} headingLevel={2} href={animePath(anime.id, animeName(anime))} name={animeName(anime)} poster={anime.coverImage?.large ?? null} badge={<span className="landing-rank">{index + 1}</span>} typeLabel={anime.format?.replaceAll('_', ' ')} ratings={sources.map(source => `${source.name} ${format.format(source.score)}/10`).join(' · ')} aside={<strong>{format.format(score)}/10</strong>} primary={primary} others={others} /></li>; })}</ol> : <div className="empty-state"><p>{d.landings.bestEmpty}</p></div>}
  </main>;
}
