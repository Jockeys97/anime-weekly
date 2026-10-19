import { getRequestLocale } from '@/lib/request-locale';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SeasonContent } from '@/components/SeasonContent';
import { CatalogCard } from '@/components/CatalogCard';
import { animeName, getSeason } from '@/lib/anilist';
import { JsonLd } from '@/components/JsonLd';
import { animeItemList, breadcrumbList, homeBreadcrumb, seasonBreadcrumb } from '@/lib/structured-data';
import { getDictionary } from '@/lib/i18n';
import { currentSeason, parseSeason, SEASONS, seasonPath, shiftSeason, type Season } from '@/lib/season';

import './season-explorer.css';
import { pageMetadata } from '@/lib/seo';
import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
import { snapshotCatalog } from '@/lib/snapshot-catalog';

function parsePage(page: string | string[] | undefined): number {
  if (page != null && (typeof page !== 'string' || !/^[1-9]\d*$/.test(page))) notFound();
  const value = page == null ? 1 : Number(page);
  if (!Number.isSafeInteger(value) || value > 2147483647) notFound();
  return value;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ year: string; season: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { year, season } = await params;
  const value = parseSeason(year, season);
  if (!value) notFound();
  const { page } = await searchParams;
  const pageNumber = parsePage(page);
  const suffix = pageNumber > 1 ? `?page=${pageNumber}` : '';
  return pageMetadata(`Anime ${season} ${year}`, `Serie e film anime della stagione ${season} ${year}.`, `${seasonPath(value)}${suffix}`);
}

export const revalidate = 86400;

export default async function SeasonPage({ params, searchParams }: {
  params: Promise<{ year: string; season: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { year, season } = await params;
  const value = parseSeason(year, season);
  if (!value) notFound();
  const { page: pageQuery } = await searchParams;
  const page = parsePage(pageQuery);
  await connection();
  const [data, snapshot] = await Promise.all([getSeason(value.year, value.season, page), getWeeklyRatings(formatWeek(isoWeek(new Date())))]);
  const summaries = snapshotCatalog(snapshot);
  const initialProviders = { unavailable: false, titles: Object.fromEntries(Object.entries(summaries).map(([id, summary]) => [`anilist:${id}`, summary.availability])) };
  // Extra rating and provider data is loaded only for cards approaching the viewport.
  const locale = await getRequestLocale();
  const d = getDictionary(locale).catalog;
  const previous = shiftSeason(value, -1);
  const next = shiftSeason(value, 1);
  const years = Array.from({ length: 9 }, (_, index) => value.year + index - 4).filter(item => item >= 1 && item <= 9999);
  const path = seasonPath(value);
  return <main className="catalog-page season-page" lang={locale}>
    <JsonLd data={animeItemList(data.media.map(anime => ({ name: animeName(anime), anilistId: anime.id })))} />
    <JsonLd data={breadcrumbList([homeBreadcrumb, { name: 'Stagioni', path: '/season' }, seasonBreadcrumb(value)])} />
    <section className="season-explorer" aria-labelledby="season-title">
      <div className="season-explorer-header">
        <div className="season-heading">
          <span className="season-emblem" aria-hidden="true"><SeasonIcon season={value.season} /></span>
          <div><p className="eyebrow">{d.seasonTitle}</p><h1 id="season-title">{d.seasonNames[value.season]} <span>{value.year}</span></h1></div>
        </div>
        <nav className="week-nav season-pager" aria-label={d.seasonLabel}>
          {previous.year >= 1 && <Link prefetch={false} href={seasonPath(previous)} aria-label={d.previousSeason}>←</Link>}
          <Link prefetch={false} href={seasonPath(currentSeason())}>{d.currentSeason}</Link>
          {next.year <= 9999 && <Link prefetch={false} href={seasonPath(next)} aria-label={d.nextSeason}>→</Link>}
        </nav>
        <p className="season-description">{d.seasonDescription}</p>
      </div>
      <div className="season-explorer-controls">
        <div className="season-filter-group">
          <p className="season-filter-label">{d.yearLabel}</p>
          <nav className="season-years" aria-label={d.yearLabel}>{years.map(item => <Link key={item} prefetch={false} href={seasonPath({ ...value, year: item })} aria-current={item === value.year ? 'page' : undefined}>{item}</Link>)}</nav>
        </div>
        <div className="season-filter-group">
          <p className="season-filter-label">{d.seasonLabel}</p>
          <nav className="season-options" aria-label={d.seasonLabel}>{SEASONS.map(item => <Link key={item} prefetch={false} href={seasonPath({ ...value, season: item })} aria-current={item === value.season ? 'page' : undefined}>
            <span className="season-option-icon" aria-hidden="true"><SeasonIcon season={item} /></span>
            <span>{d.seasonNames[item]}</span>
            <span className="season-option-indicator" aria-hidden="true" />
          </Link>)}</nav>
        </div>
      </div>
    </section>
    {data.media.length ? <SeasonContent key={`${path}:${page}`} locale={locale} initialProviders={initialProviders} providerUrl={`/api/season-providers?year=${value.year}&season=${value.season}&page=${page}&watch=v3`} entries={data.media.map(anime => ({ id: anime.id, genres: anime.genres ?? [], card: <CatalogCard anime={anime} locale={locale} initialSummary={summaries[anime.id]} /> }))} /> : <div className="empty-state" role="status"><p>{d.seasonEmpty}</p></div>}
    <nav className="catalog-pagination" aria-label={d.pagination}>
      {page > 1 && <Link prefetch={false} href={`${path}?page=${page - 1}`}>← {d.previousPage}</Link>}
      <span>{d.page} {page}</span>
      {data.pageInfo.hasNextPage && <Link prefetch={false} href={`${path}?page=${page + 1}`}>{d.nextPage} →</Link>}
    </nav>
  </main>;
}

function SeasonIcon({ season }: { season: Season }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {season === 'winter' ? <><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 11l1-4 4-1M20 13l-1 4-4 1M4 13l1 4 4 1M20 11l-1-4-4-1" /></>
      : season === 'spring' ? <><path d="M12 22v-7M12 19c-4 0-6-2-6-4 3 0 5 1 6 4" /><path d="M12 4c-4-6-8 1-4 3-6 0-4 7 1 5-3 5 5 7 6 2 4 4 8-3 3-5 6-3 0-8-3-4 1-5-5-6-3-1Z" /><circle cx="12" cy="9" r="2" /></>
        : season === 'summer' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>
          : <><path d="M20 3c0 8-1 15-9 15-5 0-8-5-5-9 3-4 9-3 14-6Z" /><path d="M4 21 16 9M8 17v-5M8 17h5" /></>}
  </svg>;
}
