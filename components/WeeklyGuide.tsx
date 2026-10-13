import Link from 'next/link';
import { AnimeCard } from '@/components/AnimeCard';
import { Suspense } from 'react';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { StreamingCountrySelector } from '@/components/StreamingCountry';
import { SponsorSlot } from '@/components/SponsorSlot';
import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary, type Locale } from '@/lib/i18n';
import { getCachedWeekData, getCachedPrimaryWeekData, getQuickWeekData, isOMDBConfigured, type WeekData } from '@/lib/tmdb';
import { formatWeek, isoWeek, shiftWeek, weekRange, type ISOWeek } from '@/lib/week';
export async function WeeklyGuide({ week }: { week: ISOWeek }) {
  const locale = await getRequestLocale(); const d = getDictionary(locale); const range = weekRange(week);
  const current = formatWeek(week) === formatWeek(isoWeek(new Date()));
  const date = (value: Date) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(value);
  return <main id="main">
    <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="green-dot" />{d.hero.eyebrow}</p><h1>{d.hero.title}<br /><span>{d.hero.accent}</span></h1><p className="hero-description">{d.hero.description}</p></div><div className="calendar-art" aria-hidden="true"><div className="calendar-top">{d.week.label} {String(week.week).padStart(2, '0')} <span>✦</span></div><div className="calendar-number">{String(week.week).padStart(2, '0')}</div><div className="calendar-bottom">{date(range.monday)} — {date(range.sunday)}<span>↗</span></div></div></section>
    <section className="guide" aria-labelledby="releases-heading"><div className="week-toolbar"><div><div className="week-kicker"><span>{d.week.label} {String(week.week).padStart(2, '0')} / {week.year}</span>{current && <span className="current-badge">{d.week.currentBadge}</span>}</div><h2 id="releases-heading">{d.week.releases}</h2><p>{date(range.monday)} – {date(range.sunday)}, {week.year}<span className="date-divider"> / </span>{d.week.subtitle}</p></div><nav className="week-nav" aria-label={d.nav.label}><Link prefetch={false} href={`/week/${formatWeek(shiftWeek(week, -1))}`} aria-label={d.nav.previous}>←</Link><Link prefetch={false} href="/">{d.nav.current}</Link><Link prefetch={false} href={`/week/${formatWeek(shiftWeek(week, 1))}`} aria-label={d.nav.next}>→</Link></nav></div>
      <Suspense fallback={<Suspense fallback={<Suspense fallback={<p className="calendar-note" role="status">{d.loading}</p>}><QuickWeekContent week={week} locale={locale} /></Suspense>}><PrimaryWeekContent week={week} locale={locale} /></Suspense>}>
        <EnrichedWeekContent week={week} locale={locale} />
      </Suspense>
      <div className="guide-note"><p>{d.week.scope}</p><span>{d.week.cap}</span></div>
    </section><SponsorSlot />
  </main>;
}

async function QuickWeekContent({ week, locale }: { week: ISOWeek; locale: Locale }) {
  return <WeekContent data={await getQuickWeekData(week, locale)} week={week} locale={locale} loadingDetails />;
}
async function PrimaryWeekContent({ week, locale }: { week: ISOWeek; locale: Locale }) {
  return <WeekContent data={await getCachedPrimaryWeekData(week, locale)} week={week} locale={locale} loadingAnime />;
}
async function EnrichedWeekContent({ week, locale }: { week: ISOWeek; locale: Locale }) {
  return <WeekContent data={await getCachedWeekData(week, locale)} week={week} locale={locale} />;
}
function WeekContent({ data, week, locale, loadingDetails = false, loadingAnime = false }: { data: WeekData; week: ISOWeek; locale: Locale; loadingDetails?: boolean; loadingAnime?: boolean }) {
  const d = getDictionary(locale);
  return <>
{data.status === 'unconfigured' ? <div className="empty-state"><span className="state-icon" aria-hidden="true">⌁</span><p className="eyebrow">{d.week.browse}</p><h3>{d.state.unconfigured}</h3><p>{d.state.setup}</p><a className="button" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">{d.state.setupLink}<span aria-hidden="true">↗</span></a></div> : data.status === 'error' ? <div className="empty-state" role="status"><h3>{d.state.error}</h3><p>{d.state.errorBody}</p></div> : <>{data.partial && <p className="notice" role="status">{d.state.partial}</p>}{!isOMDBConfigured() && <p className="notice">{d.state.omdb}</p>}{data.titles.length ? <><StreamingCountrySelector locale={locale} />{loadingDetails || loadingAnime ? <div className="anime-grid">{data.titles.map(anime => <AnimeCard key={`${anime.kind}-${anime.id}`} anime={anime} locale={locale} loadingDetails={loadingDetails} loadingAnime={loadingAnime} />)}</div> : <Suspense fallback={<div className="anime-grid">{data.titles.map(anime => <AnimeCard key={`${anime.kind}-${anime.id}`} anime={anime} locale={locale} />)}</div>}><WeeklyCalendar titles={data.titles} week={week} locale={locale} /></Suspense>}</> : <div className="empty-state"><span className="state-icon" aria-hidden="true">☾</span><h3>{d.state.empty}</h3><p>{d.state.emptyBody}</p></div>}</>}
  </>;
}
