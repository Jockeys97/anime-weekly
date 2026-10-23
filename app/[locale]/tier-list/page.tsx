import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from '@/components/LocaleLink';
import { TierListMaker } from '@/components/TierListMaker';
import { getDictionary } from '@/lib/i18n';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { currentSeason, seasonPath, shiftSeason } from '@/lib/season';
import { pageMetadata, siteUrl } from '@/lib/seo';
import { localePath } from '@/lib/locale-routing';
import { getTierListData } from '@/lib/tier-list-data';
import type { AnimeSeason } from '@/lib/season';
import type { Locale } from '@/lib/locales';
import { tierListPath, tierSeasonFromQuery } from '@/lib/tier-list';

type Query = Promise<{ season?: string | string[]; year?: string | string[] }>;

// Request-time season/query selection; upstream data keeps its own cache.
export const revalidate = 0;

export async function generateMetadata({ params }: { params?: LocaleParams }): Promise<Metadata> {
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale).tierList;
  return pageMetadata(d.title, d.description, '/tier-list', undefined, locale);
}

export default async function TierListPage({ params, searchParams }: { params?: LocaleParams; searchParams: Query }) {
  await connection();
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale); const t = d.tierList;
  const query = await searchParams;
  const season = tierSeasonFromQuery(query.season, query.year, currentSeason());
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
    <Suspense key={`${season.year}-${season.season}`} fallback={<p className="detail-loading" role="status">{t.loading}</p>}>
      <TierListContent season={season} seasonName={seasonName} locale={locale} />
    </Suspense>
  </main>;
}

async function TierListContent({ season, seasonName, locale }: { season: AnimeSeason; seasonName: string; locale: Locale }) {
  const d = getDictionary(locale); const t = d.tierList;
  const { items, unavailable } = await getTierListData(season);
  if (unavailable) return <div className="empty-state" role="status"><p>{t.unavailable}</p><Link prefetch={false} className="button" href={tierListPath(season)}>{d.error.retry}</Link></div>;
  return items.length ? <TierListMaker key={`${season.year}-${season.season}`} locale={locale} season={season} seasonName={seasonName} items={items}
    shareUrl={new URL(localePath(tierListPath(season), locale), siteUrl()).href} />
    : <div className="empty-state" role="status"><p>{t.empty}</p></div>;
}
