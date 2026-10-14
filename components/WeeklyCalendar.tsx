'use client';
import type { ReactNode } from 'react';
import { VisitorDate, useVisitorTime } from '@/components/VisitorTime';
import { AnimeCard } from '@/components/AnimeCard';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { AnimeTitle } from '@/lib/tmdb';
import type { EpisodeDate } from '@/lib/episode-dates';
import { buildWeeklyCalendar } from '@/lib/weekly-calendar';
import type { ISOWeek } from '@/lib/week';

export function WeeklyCalendarContent({ titles, week, events, episodeDates = [], unavailable = false, locale = 'it', renderCard }: {
  titles: AnimeTitle[]; week: ISOWeek; events: Parameters<typeof buildWeeklyCalendar>[1]; episodeDates?: EpisodeDate[]; unavailable?: boolean; locale?: Locale; renderCard?: (anime: AnimeTitle) => ReactNode;
}) {
  const d = getDictionary(locale);
  const { timeZone } = useVisitorTime();
  const { days, undated } = buildWeeklyCalendar(titles, events, week, episodeDates, timeZone);
  const releaseCount = (count: number) => `${count} ${count === 1 ? d.calendar.release : d.calendar.releases}`;
  const weekday = (date: string, short = false) => <VisitorDate value={date} options={{ weekday: short ? 'short' : 'long' }} />;
  const dayDate = (date: string) => <VisitorDate value={date} options={{ month: 'short', day: 'numeric' }} />;
  return <div className="weekly-calendar">
    <p className="calendar-note">{d.calendar.timezoneNote}</p>
    <nav className="calendar-days" aria-label={d.calendar.navigation}>{days.map(day => <a key={day.date} href={`#day-${day.date}`}><span>{weekday(day.date, true)}</span><strong>{dayDate(day.date)}</strong><small>{releaseCount(day.releases.length)}</small></a>)}</nav>
    {unavailable && <p className="notice" role="status">{d.calendar.partial}</p>}
    {days.map(day => <section className="calendar-day" key={day.date} aria-labelledby={`day-${day.date}`}>
      <div className="calendar-day-heading"><h3 id={`day-${day.date}`}>{weekday(day.date)}<span>{dayDate(day.date)}</span></h3><span>{releaseCount(day.releases.length)}</span></div>
      {day.releases.length ? <div className="anime-grid">{day.releases.map(release => <div className="calendar-release" key={`${release.anime.kind}-${release.anime.id}-${release.airingAt ?? release.date}-${release.episode ?? ''}`}>
        <div className="release-stamp">{release.airingAt != null ? <><span><VisitorDate value={new Date(release.airingAt * 1000).toISOString()} options={{ hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }} /></span><span>{d.calendar.episode} {release.episode}</span><small>{release.sourceUrl ? <a href={release.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(release.sourceUrl).hostname} ↗</a> : d.calendar.airing}</small></> : <><span>{release.source === 'tmdb' ? `${d.catalog.season} ${release.season} · ${d.calendar.episode} ${release.episode}` : d.calendar.movieRelease}</span><small>{d.calendar.timeUnavailable}</small>{release.source === 'tmdb' && <a href={`https://www.themoviedb.org/tv/${release.anime.id}/season/${release.season}/episode/${release.episode}`} target="_blank" rel="noopener noreferrer">TMDB ↗</a>}</>}</div>
        {renderCard ? renderCard(release.anime) : <AnimeCard anime={release.anime} locale={locale} />}
      </div>)}</div> : <p className="calendar-day-empty">{d.calendar.emptyDay}</p>}
    </section>)}
    {undated.length > 0 && <section className="calendar-day calendar-undated" aria-labelledby="undated-releases"><div className="calendar-day-heading"><h3 id="undated-releases">{d.calendar.undated}</h3><span>{undated.length} {undated.length === 1 ? d.calendar.title : d.calendar.titles}</span></div><p className="calendar-note">{d.calendar.undatedNote}</p><div className="anime-grid">{undated.map(anime => <div key={`${anime.kind}-${anime.id}`}>{renderCard ? renderCard(anime) : <AnimeCard anime={anime} locale={locale} />}</div>)}</div></section>}
  </div>;
}
