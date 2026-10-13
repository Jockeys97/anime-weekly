import Link from 'next/link';
import { Suspense } from 'react';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { StreamingCountrySelector } from '@/components/StreamingCountry';
import { SponsorSlot } from '@/components/SponsorSlot';
import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import { getCachedWeekData, isOMDBConfigured } from '@/lib/tmdb';
import { formatWeek, isoWeek, shiftWeek, weekRange, type ISOWeek } from '@/lib/week';
export async function WeeklyGuide({ week }: { week: ISOWeek }) {
  const locale = await getRequestLocale(); const d = getDictionary(locale); const data = await getCachedWeekData(week, locale); const range = weekRange(week);
  const current = formatWeek(week) === formatWeek(isoWeek(new Date()));
  const date = (value: Date) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(value);
  return <main id="main">
    <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="green-dot" />{d.hero.eyebrow}</p><h1>{d.hero.title}<br /><span>{d.hero.accent}</span></h1><p className="hero-description">{d.hero.description}</p></div><div className="calendar-art" aria-hidden="true"><div className="calendar-top">{d.week.label} {String(week.week).padStart(2, '0')} <span>✦</span></div><div className="calendar-number">{String(week.week).padStart(2, '0')}</div><div className="calendar-bottom">{date(range.monday)} — {date(range.sunday)}<span>↗</span></div></div></section>
    <section className="guide" aria-labelledby="releases-heading"><div className="week-toolbar"><div><div className="week-kicker"><span>{d.week.label} {String(week.week).padStart(2, '0')} / {week.year}</span>{current && <span className="current-badge">{d.week.currentBadge}</span>}</div><h2 id="releases-heading">{d.week.releases}</h2><p>{date(range.monday)} – {date(range.sunday)}, {week.year}<span className="date-divider"> / </span>{d.week.subtitle}</p></div><nav className="week-nav" aria-label={d.nav.label}><Link prefetch={false} href={`/week/${formatWeek(shiftWeek(week, -1))}`} aria-label={d.nav.previous}>←</Link><Link prefetch={false} href="/">{d.nav.current}</Link><Link prefetch={false} href={`/week/${formatWeek(shiftWeek(week, 1))}`} aria-label={d.nav.next}>→</Link></nav></div>
      {data.status === 'unconfigured' ? <div className="empty-state"><span className="state-icon" aria-hidden="true">⌁</span><p className="eyebrow">{d.week.browse}</p><h3>{d.state.unconfigured}</h3><p>{d.state.setup}</p><a className="button" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">{d.state.setupLink}<span aria-hidden="true">↗</span></a></div> : data.status === 'error' ? <div className="empty-state" role="status"><h3>{d.state.error}</h3><p>{d.state.errorBody}</p></div> : <>{data.partial && <p className="notice" role="status">{d.state.partial}</p>}{!isOMDBConfigured() && <p className="notice">{d.state.omdb}</p>}{data.titles.length ? <><StreamingCountrySelector locale={locale} /><Suspense fallback={<p className="calendar-note" role="status">{d.calendar.loading}</p>}><WeeklyCalendar titles={data.titles} week={week} locale={locale} /></Suspense></> : <div className="empty-state"><span className="state-icon" aria-hidden="true">☾</span><h3>{d.state.empty}</h3><p>{d.state.emptyBody}</p></div>}</>}
      <div className="guide-note"><p>{d.week.scope}</p><span>{d.week.cap}</span></div>
    </section><SponsorSlot />
  </main>;
}
