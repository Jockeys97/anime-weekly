import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { StreamingCountrySelector } from '@/components/StreamingCountry';
import { CatalogCard } from '@/components/CatalogCard';
import { getSeason } from '@/lib/anilist';
import { getDictionary } from '@/lib/i18n';
import { currentSeason, parseSeason, SEASONS, seasonPath, shiftSeason } from '@/lib/season';

export const revalidate = 86400;

export default async function SeasonPage({ params, searchParams }: {
  params: Promise<{ year: string; season: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await connection();
  const { year, season } = await params;
  const value = parseSeason(year, season);
  if (!value) notFound();
  const { page: pageQuery } = await searchParams;
  if (pageQuery != null && (typeof pageQuery !== 'string' || !/^[1-9]\d*$/.test(pageQuery))) notFound();
  const page = pageQuery == null ? 1 : Number(pageQuery);
  if (!Number.isSafeInteger(page) || page > 2147483647) notFound();
  const data = await getSeason(value.year, value.season, page);
  // Card enrichment is deferred until each card approaches the viewport.
  const d = getDictionary('it').catalog;
  const previous = shiftSeason(value, -1);
  const next = shiftSeason(value, 1);
  const years = Array.from({ length: 9 }, (_, index) => value.year + index - 4).filter(item => item >= 1 && item <= 9999);
  const path = seasonPath(value);
  return <main className="catalog-page" lang="it">
    <div className="week-toolbar">
      <div><p className="eyebrow">{d.seasonTitle}</p><h1>{d.seasonNames[value.season]} {value.year}</h1><p>{d.seasonDescription}</p></div>
      <nav className="week-nav" aria-label={d.seasonLabel}>
        {previous.year >= 1 && <Link prefetch={false} href={seasonPath(previous)} aria-label={d.previousSeason}>←</Link>}
        <Link prefetch={false} href={seasonPath(currentSeason())}>{d.currentSeason}</Link>
        {next.year <= 9999 && <Link prefetch={false} href={seasonPath(next)} aria-label={d.nextSeason}>→</Link>}
      </nav>
    </div>
    <nav className="catalog-filters" aria-label={d.yearLabel}>{years.map(item => <Link key={item} prefetch={false} href={seasonPath({ ...value, year: item })} aria-current={item === value.year ? 'page' : undefined}>{item}</Link>)}</nav>
    <nav className="catalog-filters" aria-label={d.seasonLabel}>{SEASONS.map(item => <Link key={item} prefetch={false} href={seasonPath({ ...value, season: item })} aria-current={item === value.season ? 'page' : undefined}>{d.seasonNames[item]}</Link>)}</nav>
    {data.media.length ? <><StreamingCountrySelector locale="it" /><div className="anime-grid">{data.media.map(anime => <CatalogCard key={anime.id} anime={anime} />)}</div></> : <div className="empty-state" role="status"><p>{d.seasonEmpty}</p></div>}
    <nav className="catalog-pagination" aria-label={d.pagination}>
      {page > 1 && <Link prefetch={false} href={`${path}?page=${page - 1}`}>← {d.previousPage}</Link>}
      <span>{d.page} {page}</span>
      {data.pageInfo.hasNextPage && <Link prefetch={false} href={`${path}?page=${page + 1}`}>{d.nextPage} →</Link>}
    </nav>
  </main>;
}
