'use client';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStreamingCountry } from '@/components/StreamingCountry';
import type { StreamingRegion } from '@/lib/config';
import { getDictionary, type Locale } from '@/lib/i18n';
import { providerBase } from '@/lib/landing-providers';
import { providerWatchLink } from '@/lib/provider-watch-link';
import type { AnimeTitle, Provider } from '@/lib/tmdb';
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

export const GLANCE_PROVIDER_LIMIT = 2;
/** Platforms for the selected country, reseller/ad-tier variants collapsed, logos only. */
export function glanceProviders(anime: Pick<AnimeTitle, 'providers'>, region: StreamingRegion, limit = GLANCE_PROVIDER_LIMIT): Provider[] {
  const byBase = new Map<string, Provider>();
  for (const provider of anime.providers?.[region]?.providers ?? []) {
    if (!provider.logo_path && !provider.logo_url) continue;
    const key = providerBase(provider.provider_name); const current = byBase.get(key);
    if (!current || provider.provider_name.length < current.provider_name.length) byBase.set(key, provider);
  }
  return [...byBase.values()].slice(0, limit);
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

/** Fully visible columns of the horizontal scroller (mobile). */
export function visibleDayRange(columns: { left: number; width: number }[], scrollLeft: number, clientWidth: number) {
  if (!columns.length) return { first: 0, last: 0 };
  const firstIndex = columns.findIndex(column => column.left >= scrollLeft - 1);
  const first = firstIndex < 0 ? columns.length - 1 : firstIndex;
  let last = first;
  while (last + 1 < columns.length && columns[last + 1].left + columns[last + 1].width <= scrollLeft + clientWidth + 1) last++;
  return { first, last };
}

export function WeekAtAGlance({ days, locale = 'it' }: { days: CalendarDay[]; locale?: Locale }) {
  const d = getDictionary(locale);
  const { region } = useStreamingCountry();
  const scroller = useRef<HTMLDivElement>(null);
  // Before measuring, assume the narrowest layout: three columns from Monday.
  const [range, setRange] = useState({ first: 0, last: Math.min(2, days.length - 1) });
  const columns = useCallback(() => [...(scroller.current?.querySelectorAll<HTMLElement>(':scope > ol > li') ?? [])], []);
  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const next = visibleDayRange(columns().map(item => ({ left: item.offsetLeft, width: item.offsetWidth })), element.scrollLeft, element.clientWidth);
    setRange(previous => previous.first === next.first && previous.last === next.last ? previous : next);
  }, [columns]);
  useEffect(() => {
    const element = scroller.current;
    if (!element || typeof window === 'undefined') return;
    // Animation frames are absent in some non-browser runtimes: fall back to a timer.
    const frames = typeof window.requestAnimationFrame === 'function';
    let frame = 0;
    const cancel = () => frames ? window.cancelAnimationFrame(frame) : window.clearTimeout(frame);
    const schedule = () => { cancel(); frame = frames ? window.requestAnimationFrame(measure) : window.setTimeout(measure, 16); };
    schedule();
    element.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancel(); element.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [measure, days.length]);
  const scrollToDay = (index: number) => {
    const target = columns()[Math.max(0, Math.min(index, days.length - 1))];
    if (!target || !scroller.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.current.scrollTo({ left: target.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  };
  const shortDay = (date: string) => `${glanceWeekday(date, locale)} ${glanceDayNumber(date)}`;
  const nextDay = days[range.last + 1];
  const scrollable = range.first > 0 || range.last < days.length - 1;
  const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
  const longDay = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utcDate(date));
  const releaseLabel = (release: CalendarRelease) => release.episode != null ? `${d.calendar.episode} ${release.episode}` : d.calendar.movieRelease;
  return <section className="week-glance" aria-labelledby="week-glance-title">
    <h2 id="week-glance-title" className="week-glance-title">{d.calendar.glanceTitle}</h2>
    {/* Mobile only: the columns scroll sideways, so keep the visible days and the
        way forward in view while reading down a long column. */}
    {days.length > 0 && <div className={`week-glance-bar${scrollable ? '' : ' is-static'}`}>
      <button type="button" className="week-glance-arrow" onClick={() => scrollToDay(range.first - 1)} disabled={range.first === 0} aria-label={d.calendar.glancePrevDays} aria-controls="week-glance-scroller">‹</button>
      <span className="week-glance-range" aria-live="polite">{shortDay(days[range.first].date)}{range.last > range.first ? ` – ${shortDay(days[range.last].date)}` : ''}</span>
      <button type="button" className="week-glance-arrow" onClick={() => scrollToDay(range.first + 1)} disabled={!nextDay} aria-label={d.calendar.glanceNextDays} aria-controls="week-glance-scroller">›</button>
    </div>}
    {nextDay && <div className="week-glance-rail" aria-hidden="true">
      <button type="button" className="week-glance-next" tabIndex={-1} onClick={() => scrollToDay(range.first + 1)} aria-label={fill(d.calendar.glanceScrollTo, { day: longDay(nextDay.date) })}>
        {shortDay(nextDay.date)} <span aria-hidden="true">›</span>
      </button>
    </div>}
    <div className="week-glance-scroller" id="week-glance-scroller" ref={scroller}>
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
            const providers = glanceProviders(first.anime, region);
            return <li key={releaseAnchorId(first)}>
              <a className="week-glance-poster" href={`#${releaseAnchorId(first)}`} aria-label={fill(d.calendar.glanceJumpToRelease, { title: caption })}>
                {first.anime.poster ? <Image src={`https://image.tmdb.org/t/p/w185${first.anime.poster}`} alt={first.anime.name} fill loading="lazy" sizes="(max-width: 899px) 96px, 14vw" /> : <span className="week-glance-nopic" aria-hidden="true">{first.anime.name}</span>}
                {group.length > 1 && <span className="week-glance-count" aria-hidden="true">×{group.length}</span>}
                <span className="week-glance-caption" aria-hidden="true">{caption}</span>
              </a>
              {/* Siblings of the poster link (links cannot nest); same destination as the detail page's platform links. */}
              {providers.length > 0 && <span className="week-glance-providers">{providers.map(provider => <a key={provider.provider_id} className="week-glance-provider"
                href={provider.watch_url || providerWatchLink(first.anime.kind, first.anime.id, region, provider.provider_id)} target="_blank" rel="noopener noreferrer"
                aria-label={`${first.anime.name} · ${provider.provider_name} · ${d.regions[region]} · ${d.title.watch}`} title={provider.provider_name}>
                <Image src={provider.logo_path ? `https://image.tmdb.org/t/p/w92${provider.logo_path}` : provider.logo_url!} alt="" width={22} height={22} loading="lazy" />
              </a>)}</span>}
            </li>;
          })}</ul> : <p className="week-glance-empty">{d.calendar.glanceEmpty}</p>}
        </li>;
      })}</ol>
    </div>
  </section>;
}
