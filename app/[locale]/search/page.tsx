import Link from '@/components/LocaleLink';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { SeasonContent } from '@/components/SeasonContent';
import { PlatformOptionsProvider } from '@/components/PlatformOptions';
import { CatalogCard } from '@/components/CatalogCard';
import { AnimeSearchFilters } from '@/components/AnimeSearchFilters';
import { discoverAnime } from '@/lib/anilist';
import { parseAnimeFilters, searchHref, type AnimeFilters, type SearchParams } from '@/lib/anime-search';
import { getDictionary, type Locale } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
import { snapshotCatalog } from '@/lib/snapshot-catalog';
export async function generateMetadata({ searchParams, params }: { params?: LocaleParams; searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const locale = await getRequestLocale(params); const d = getDictionary(locale);
  return {
    ...pageMetadata(d.catalog.searchTitle, d.catalog.searchPrompt, '/search', undefined, locale),
    ...(Object.keys(query).length ? { robots: { index: false, follow: true } } : {}),
  };
}
// Query-dependent HTML must not become an on-demand static locale page.
// Unlike force-dynamic, revalidate=0 preserves explicitly cached API fetches.
export const revalidate = 0;
export default async function SearchPage({ searchParams, params }: { params?: LocaleParams; searchParams: Promise<SearchParams> }) {
  await connection();
  const filters = parseAnimeFilters(await searchParams);
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale);
  return <main className="catalog-page explore-page" lang={locale}>
    <header className="explore-heading"><p className="eyebrow">{d.explore.eyebrow}</p><h1>{d.catalog.searchTitle}</h1><p className="catalog-intro">{d.explore.intro}</p></header>
    <PlatformOptionsProvider>
    <AnimeSearchFilters key={searchHref(filters)} filters={filters} locale={locale} />
    <Suspense key={`${locale}:${searchHref(filters)}`} fallback={<p className="detail-loading" role="status">{d.explore.loading}</p>}><SearchResults filters={filters} locale={locale} /></Suspense>
    </PlatformOptionsProvider>
  </main>;
}
async function SearchResults({ filters, locale }: { filters: AnimeFilters; locale: Locale }) {
  const [data, snapshot] = await Promise.all([discoverAnime(filters), getWeeklyRatings(formatWeek(isoWeek(new Date())))]);
  const d = getDictionary(locale);
  // Same platform filter as the season pages, scoped to this page of results.
  const summaries = snapshotCatalog(snapshot);
  const initialProviders = { unavailable: false, titles: Object.fromEntries(Object.entries(summaries).filter(([id]) => data.media.some(anime => anime.id === Number(id))).map(([id, summary]) => [`anilist:${id}`, summary.availability])) };
  const providerUrl = `/api/search-providers?${searchHref(filters, filters.page).split('?')[1]}`;
  return <section aria-labelledby="search-results-heading">
    <div className="explore-results-heading"><h2 id="search-results-heading">{filters.q ? `${d.catalog.searchResults} «${filters.q}»` : d.explore.discover}</h2><span>{d.catalog.page} {filters.page} · {data.media.length} {d.explore.results}</span></div>
    {data.unavailable ? <div className="empty-state" role="status"><p>{d.explore.error}</p><Link href={searchHref(filters)} prefetch={false}>{d.explore.retry}</Link></div> : data.media.length ? <SeasonContent key={providerUrl} locale={locale} showGenre={false} initialProviders={initialProviders} providerUrl={providerUrl} entries={data.media.map(anime => ({ id: anime.id, genres: anime.genres ?? [], card: <CatalogCard anime={anime} locale={locale} initialSummary={summaries[anime.id]} /> }))} /> : <div className="empty-state" role="status"><h3>{d.catalog.noResults}</h3><p>{d.explore.emptyHint}</p><Link href="/search" prefetch={false}>{d.explore.reset}</Link></div>}
    {!data.unavailable && <nav className="catalog-pagination" aria-label={d.catalog.pagination}>{filters.page > 1 && <Link href={searchHref(filters, filters.page - 1)} prefetch={false}>← {d.catalog.previousPage}</Link>}<span>{d.catalog.page} {filters.page}</span>{data.pageInfo.hasNextPage && filters.page < 500 && <Link href={searchHref(filters, filters.page + 1)} prefetch={false}>{d.catalog.nextPage} →</Link>}</nav>}
  </section>;
}
