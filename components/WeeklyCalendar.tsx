import { AnimeCard } from '@/components/AnimeCard';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { AnimeTitle } from '@/lib/tmdb';
import { getWeekAirings } from '@/lib/airing-schedule';
import { buildWeeklyCalendar } from '@/lib/weekly-calendar';
import type { ISOWeek } from '@/lib/week';

export async function WeeklyCalendar({ titles, week, locale = 'en' }: { titles: AnimeTitle[]; week: ISOWeek; locale?: Locale }) {
  const ids = titles.filter(anime => anime.kind === 'tv').map(anime => anime.ratings.anilistId).filter((id): id is number => typeof id === 'number');
  const schedule = await getWeekAirings(ids, week);
  return <WeeklyCalendarContent titles={titles} week={week} events={schedule.events} locale={locale} unavailable={schedule.unavailable} />;
}

export function WeeklyCalendarContent({ titles, week, events, unavailable = false, locale = 'en' }: {
  titles: AnimeTitle[]; week: ISOWeek; events: Parameters<typeof buildWeeklyCalendar>[1]; unavailable?: boolean; locale?: Locale;
}) {
  const d = getDictionary(locale);
  const { days, undated } = buildWeeklyCalendar(titles, events, week);
  const releaseCount = (count: number) => `${count} ${count === 1 ? d.calendar.release : d.calendar.releases}`;
  const weekday = (date: string, short = false) => new Intl.DateTimeFormat(locale, { weekday: short ? 'short' : 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const dayDate = (date: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  return <div className="weekly-calendar">
    <p className="calendar-note">{d.calendar.timezoneNote}</p>
    <nav className="calendar-days" aria-label={d.calendar.navigation}>{days.map(day => <a key={day.date} href={`#day-${day.date}`}><span>{weekday(day.date, true)}</span><strong>{dayDate(day.date)}</strong><small>{releaseCount(day.releases.length)}</small></a>)}</nav>
    {unavailable && <p className="notice" role="status">{d.calendar.partial}</p>}
    {days.map(day => <section className="calendar-day" key={day.date} aria-labelledby={`day-${day.date}`}>
      <div className="calendar-day-heading"><h3 id={`day-${day.date}`}>{weekday(day.date)}<span>{dayDate(day.date)}</span></h3><span>{releaseCount(day.releases.length)}</span></div>
      {day.releases.length ? <div className="anime-grid">{day.releases.map(release => <div className="calendar-release" key={`${release.anime.kind}-${release.anime.id}-${release.airingAt ?? release.date}-${release.episode ?? ''}`}>
        <div className="release-stamp">{release.airingAt != null ? <><time dateTime={new Date(release.airingAt * 1000).toISOString()}>{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(release.airingAt * 1000))} UTC</time><span>{d.calendar.episode} {release.episode}</span><small>{d.calendar.airing}</small></> : <><span>{d.calendar.movieRelease}</span><small>{d.calendar.timeUnavailable}</small></>}</div>
        <AnimeCard anime={release.anime} locale={locale} />
      </div>)}</div> : <p className="calendar-day-empty">{d.calendar.emptyDay}</p>}
    </section>)}
    {undated.length > 0 && <section className="calendar-day calendar-undated" aria-labelledby="undated-releases"><div className="calendar-day-heading"><h3 id="undated-releases">{d.calendar.undated}</h3><span>{undated.length} {undated.length === 1 ? d.calendar.title : d.calendar.titles}</span></div><p className="calendar-note">{d.calendar.undatedNote}</p><div className="anime-grid">{undated.map(anime => <AnimeCard key={`${anime.kind}-${anime.id}`} anime={anime} locale={locale} />)}</div></section>}
  </div>;
}
