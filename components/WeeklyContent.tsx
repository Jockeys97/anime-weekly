'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WeeklyTopFive } from '@/components/WeeklyTopFive';
import { TitleFilters } from '@/components/TitleFilters';
import { useWatchlist } from '@/components/Watchlist';
import { watchlistId } from '@/lib/watchlist';
import { filterTitles, filterOptions } from '@/lib/title-filters';
import { useStreamingCountry } from '@/components/StreamingCountry';
import Link from 'next/link';
import { AnimeCard } from '@/components/AnimeCard';
import { WeeklyCalendarContent } from '@/components/WeeklyCalendar';
import { StreamingCountrySelector } from '@/components/StreamingCountry';
import { useLocale } from '@/components/LanguageSelector';
import { VisitorDate } from '@/components/VisitorTime';
import { getDictionary } from '@/lib/i18n';
import type { AiringEvent } from '@/lib/airing-schedule';
import type { AnimeTitle, WeekData } from '@/lib/tmdb';
import type { WeeklySchedule, WeeklyTitleDetails } from '@/lib/weekly-details';
import { invalidateWeeklyLookup, loadWeeklyLookup } from '@/lib/weekly-client';
import { formatWeek, isoWeek, shiftWeek, weekRange, type ISOWeek } from '@/lib/week';
const titleKey = (anime: Pick<AnimeTitle, 'kind' | 'id'>) => `${anime.kind}:${anime.id}`;
export function WeeklyHeading({ week }: { week: ISOWeek }) {
  const d = getDictionary(useLocale()); const range = weekRange(week);
  return <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="green-dot" />{d.hero.eyebrow}</p><h1>{d.hero.title}<br /><span>{d.hero.accent}</span></h1><p className="hero-description">{d.hero.description}</p></div><div className="calendar-art" aria-hidden="true"><div className="calendar-top">{d.week.label} {String(week.week).padStart(2, '0')} <span>✦</span></div><div className="calendar-number">{String(week.week).padStart(2, '0')}</div><div className="calendar-bottom"><VisitorDate value={range.start} options={{ month: 'short', day: 'numeric' }} /> — <VisitorDate value={range.end} options={{ month: 'short', day: 'numeric' }} /><span>↗</span></div></div></section>;
}
export function WeeklyScope() {
  const d = getDictionary(useLocale());
  return <div className="guide-note"><p>{d.week.scope}</p><span>{d.week.cap}</span></div>;
}
interface CardState { status: 'loading' | 'ready' | 'error'; details?: WeeklyTitleDetails; schedule?: WeeklySchedule; schedulePending?: boolean }
export function WeeklyContent({ initial, week, initialEvents = [] }: { initial: WeekData; week: ISOWeek; initialEvents?: AiringEvent[] }) {
  const locale = useLocale(); const d = getDictionary(locale); const range = weekRange(week);
  const container = useRef<HTMLDivElement>(null);
  const started = useRef(new Set<string>());
  const controllers = useRef(new Set<AbortController>());
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [today, setToday] = useState<string | null>(null);
  const slug = formatWeek(week);
  const { region } = useStreamingCountry();
  const watchlist = useWatchlist();
  const [genre, setGenre] = useState('');
  const [platformSelection, setPlatform] = useState({ region, value: '' });
  const platform = platformSelection.region === region ? platformSelection.value : '';
  if (platformSelection.region !== region) setPlatform({ region, value: '' });
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const urls = useCallback((anime: AnimeTitle) => {
    const query = new URLSearchParams({ week: slug, kind: anime.kind, id: String(anime.id) });
    return { details: `/api/weekly-title?${query}`, schedule: `/api/weekly-schedule?${query}` };
  }, [slug]);
  const load = useCallback((anime: AnimeTitle, retry = false) => {
    const key = titleKey(anime);
    if (!retry && started.current.has(key)) return;
    started.current.add(key);
    const url = urls(anime);
    if (retry) { invalidateWeeklyLookup(url.details); invalidateWeeklyLookup(url.schedule); }
    const controller = new AbortController(); controllers.current.add(controller);
    setCards(previous => ({ ...previous, [key]: { ...previous[key], status: 'loading' } }));
    void loadWeeklyLookup<WeeklyTitleDetails>(url.details, controller.signal).then(async details => {
      if (controller.signal.aborted) return;
      const incomplete = details.providersUnavailable;
      setCards(previous => ({ ...previous, [key]: { status: incomplete ? 'error' : 'ready', details, schedulePending: anime.kind === 'tv' } }));
      if (anime.kind === 'tv') {
        const schedule = await loadWeeklyLookup<WeeklySchedule>(url.schedule, controller.signal)
          .catch(() => ({ events: [], episodeDates: [], unavailable: true }));
        if (!controller.signal.aborted) setCards(previous => ({ ...previous, [key]: { ...previous[key], schedule, schedulePending: false } }));
      }
    }).catch(() => {
      if (!controller.signal.aborted) setCards(previous => ({ ...previous, [key]: { ...previous[key], status: 'error', schedulePending: false } }));
    }).finally(() => { controllers.current.delete(controller); });
  }, [urls]);
  useEffect(() => {
    // Browser time is read after hydration, so the cached markup stays stable.
    const timer = setTimeout(() => setToday(formatWeek(isoWeek(new Date()))), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const active = controllers.current;
    const seen = started.current;
    return () => { active.forEach(controller => controller.abort()); active.clear(); seen.clear(); };
  }, []);
  useEffect(() => {
    if (!container.current) return;
    const titles = new Map(initial.titles.map(anime => [titleKey(anime), anime]));
    const nodes = container.current.querySelectorAll<HTMLElement>('[data-weekly-title]');
    if (typeof IntersectionObserver === 'undefined') { titles.forEach(anime => load(anime)); return; }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const anime = titles.get((entry.target as HTMLElement).dataset.weeklyTitle || '');
        if (anime) load(anime);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '200px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [initial.titles, load, cards]);
  useEffect(() => {
    if (genre || platform || onlyWatchlist) initial.titles.forEach(anime => load(anime));
  }, [genre, platform, onlyWatchlist, initial.titles, load]);
  const titles = initial.titles.map(anime => {
    const details = cards[titleKey(anime)]?.details;
    return details ? { ...anime, ...details } : anime;
  });
  const filterable = titles.map(title => ({ ...title, key: watchlistId(title) }));
  const options = filterOptions(filterable, region);
  const visible = filterTitles(filterable, { genre, platform, region, onlyWatchlist, watchlist });
  const schedules = Object.values(cards).flatMap(card => card.schedule ? [card.schedule] : []);
  const renderCard = (anime: AnimeTitle) => {
    const card = cards[titleKey(anime)];
    return <AnimeCard anime={anime} locale={locale} loadingDetails={card?.status === 'loading'} enrichmentFailed={card?.status === 'error'} onRetry={() => load(anime, true)} />;
  };
  return <div ref={container}>
    <WeeklyTopFive titles={initial.titles} slug={slug} />
    <div className="week-toolbar"><div><div className="week-kicker"><span>{d.week.label} {String(week.week).padStart(2, '0')} / {week.year}</span>{today === slug && <span className="current-badge">{d.week.currentBadge}</span>}</div><h2 id="releases-heading">{d.week.releases}</h2><p><VisitorDate value={range.start} options={{ month: 'short', day: 'numeric' }} /> – <VisitorDate value={range.end} options={{ month: 'short', day: 'numeric' }} />, {week.year}<span className="date-divider"> / </span>{d.week.subtitle}</p></div><nav className="week-nav" aria-label={d.nav.label}><Link prefetch={false} href={`/week/${formatWeek(shiftWeek(week, -1))}`} aria-label={d.nav.previous}>←</Link><Link prefetch={false} href="/">{d.nav.current}</Link><Link prefetch={false} href={`/week/${formatWeek(shiftWeek(week, 1))}`} aria-label={d.nav.next}>→</Link></nav></div>
    {initial.status === 'unconfigured' ? <div className="empty-state"><span className="state-icon" aria-hidden="true">⌁</span><p className="eyebrow">{d.week.browse}</p><h3>{d.state.unconfigured}</h3><p>{d.state.setup}</p><a className="button" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">{d.state.setupLink}<span aria-hidden="true">↗</span></a></div> : initial.status === 'error' ? <div className="empty-state" role="status"><h3>{d.state.error}</h3><p>{d.state.errorBody}</p></div> : <>
      {initial.partial && <p className="notice" role="status">{d.state.partial}</p>}
      {titles.length ? <><StreamingCountrySelector locale={locale} /><TitleFilters {...options} genre={genre} platform={platform} onlyWatchlist={onlyWatchlist} onGenre={setGenre} onPlatform={value => { setPlatform({ region, value }); initial.titles.forEach(anime => load(anime)); }} onWatchlist={setOnlyWatchlist} />{!visible.length && <p role="status">{d.features.noMatches}</p>}<WeeklyCalendarContent titles={visible} week={week} events={[...initialEvents, ...schedules.flatMap(schedule => schedule.events)]} episodeDates={schedules.flatMap(schedule => schedule.episodeDates)} unavailable={schedules.some(schedule => schedule.unavailable)} locale={locale} renderCard={renderCard} />{schedules.some(schedule => schedule.unavailable) && <button type="button" className="button" onClick={() => initial.titles.forEach(anime => { if (cards[titleKey(anime)]?.schedule?.unavailable) load(anime, true); })}>{d.error.retry}</button>}</> : <div className="empty-state"><span className="state-icon" aria-hidden="true">☾</span><h3>{d.state.empty}</h3><p>{d.state.emptyBody}</p></div>}
    </>}
  </div>;
}
