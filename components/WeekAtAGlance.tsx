'use client';
import Image from 'next/image';
import { VisitorDate } from '@/components/VisitorTime';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { CalendarDay, CalendarRelease } from '@/lib/weekly-calendar';

export const releaseAnchorId = (release: CalendarRelease) => `release-${release.date}-${release.anime.kind}-${release.anime.id}-${release.episode ?? 'x'}`;

export function WeekAtAGlance({ days, locale = 'it' }: { days: CalendarDay[]; locale?: Locale }) {
  const d = getDictionary(locale);
  const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
  const longDay = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const releaseLabel = (release: CalendarRelease) => release.episode != null ? `${d.calendar.episode} ${release.episode}` : d.calendar.movieRelease;
  return <section className="week-glance" aria-labelledby="week-glance-title">
    <h2 id="week-glance-title" className="week-glance-title">{d.calendar.glanceTitle}</h2>
    <div className="week-glance-scroller">
      <ol className="week-glance-days">{days.map(day => <li className="week-glance-day" key={day.date}>
        <a className="week-glance-head" href={`#day-${day.date}`} aria-label={`${fill(d.calendar.glanceJumpToDay, { day: longDay(day.date) })} — ${day.releases.length}`}>
          <span><VisitorDate value={day.date} options={{ weekday: 'short' }} /></span>
          <strong>{day.date.slice(8)}</strong>
          <small>{day.releases.length}</small>
        </a>
        {day.releases.length ? <ul className="week-glance-posters">{day.releases.map(release => {
          const caption = `${release.anime.name} · ${releaseLabel(release)}`;
          return <li key={releaseAnchorId(release)}>
            <a className="week-glance-poster" href={`#${releaseAnchorId(release)}`} aria-label={fill(d.calendar.glanceJumpToRelease, { title: caption })}>
              {release.anime.poster ? <Image src={`https://image.tmdb.org/t/p/w185${release.anime.poster}`} alt={release.anime.name} fill loading="lazy" sizes="(max-width: 899px) 96px, 14vw" /> : <span className="week-glance-nopic" aria-hidden="true">{release.anime.name}</span>}
              <span className="week-glance-caption" aria-hidden="true">{caption}</span>
            </a>
          </li>;
        })}</ul> : <p className="week-glance-empty">{d.calendar.glanceEmpty}</p>}
      </li>)}</ol>
    </div>
  </section>;
}
