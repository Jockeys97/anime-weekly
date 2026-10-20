'use client';
import Image from 'next/image';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { CalendarDay, CalendarRelease } from '@/lib/weekly-calendar';

export const releaseAnchorId = (release: CalendarRelease) => `release-${release.date}-${release.anime.kind}-${release.anime.id}-${release.episode ?? 'x'}`;

export function groupReleases(releases: CalendarRelease[]) {
  const groups = new Map<string, CalendarRelease[]>();
  for (const release of releases) {
    const key = `${release.anime.kind}-${release.anime.id}`;
    const list = groups.get(key);
    if (list) list.push(release); else groups.set(key, [release]);
  }
  return [...groups.values()];
}

const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);

// Route locale + UTC (not the browser language/time zone) so SSR and hydration render the same label.
export const glanceWeekday = (date: string, locale: Locale) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utcDate(date));

export const glanceDayNumber = (date: string) => String(utcDate(date).getUTCDate());

export function glanceSeriesLabel(count: number, locale: Locale) {
  const d = getDictionary(locale);
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? d.calendar.glanceSeriesOne : d.calendar.glanceSeriesOther;
  return template.replace('{count}', String(count));
}

export function WeekAtAGlance({ days, locale = 'it' }: { days: CalendarDay[]; locale?: Locale }) {
  const d = getDictionary(locale);
  const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
  const longDay = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utcDate(date));
  const releaseLabel = (release: CalendarRelease) => release.episode != null ? `${d.calendar.episode} ${release.episode}` : d.calendar.movieRelease;
  return <section className="week-glance" aria-labelledby="week-glance-title">
    <h2 id="week-glance-title" className="week-glance-title">{d.calendar.glanceTitle}</h2>
    <div className="week-glance-scroller">
      <ol className="week-glance-days">{days.map(day => {
        const groups = groupReleases(day.releases);
        const seriesLabel = glanceSeriesLabel(groups.length, locale);
        return <li className="week-glance-day" key={day.date}>
          <a className="week-glance-head" href={`#day-${day.date}`} aria-label={`${fill(d.calendar.glanceJumpToDay, { day: longDay(day.date) })} — ${seriesLabel}`}>
            <span><time dateTime={day.date}>{glanceWeekday(day.date, locale)}</time></span>
            <strong>{glanceDayNumber(day.date)}</strong>
            <small>{seriesLabel}</small>
          </a>
          {groups.length ? <ul className="week-glance-posters">{groups.map(group => {
            const first = group[0];
            const episodes = group.map(releaseLabel);
            const caption = group.length > 1 ? `${first.anime.name} · ${episodes.join(', ')}` : `${first.anime.name} · ${episodes[0]}`;
            return <li key={releaseAnchorId(first)}>
              <a className="week-glance-poster" href={`#${releaseAnchorId(first)}`} aria-label={fill(d.calendar.glanceJumpToRelease, { title: caption })}>
                {first.anime.poster ? <Image src={`https://image.tmdb.org/t/p/w185${first.anime.poster}`} alt={first.anime.name} fill loading="lazy" sizes="(max-width: 899px) 96px, 14vw" /> : <span className="week-glance-nopic" aria-hidden="true">{first.anime.name}</span>}
                {group.length > 1 && <span className="week-glance-count" aria-hidden="true">×{group.length}</span>}
                <span className="week-glance-caption" aria-hidden="true">{caption}</span>
              </a>
            </li>;
          })}</ul> : <p className="week-glance-empty">{d.calendar.glanceEmpty}</p>}
        </li>;
      })}</ol>
    </div>
  </section>;
}
