'use client';
import Image from 'next/image';
import { useStreamingCountry } from '@/components/StreamingCountry';
import { useTrailerHover } from '@/components/GlanceTrailer';
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

export function WeekAtAGlance({ days, locale = 'it', anilistIds = {} }: { days: CalendarDay[]; locale?: Locale; anilistIds?: Record<string, number> }) {
  const d = getDictionary(locale);
  const { region } = useStreamingCountry();
  const trailer = useTrailerHover();
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
            const providers = glanceProviders(first.anime, region);
            const anilistId = anilistIds[`${first.anime.kind}:${first.anime.id}`] ?? first.anime.ratings?.anilistId;
            return <li key={releaseAnchorId(first)} {...trailer.bind(releaseAnchorId(first), anilistId, `${d.trailer.heading} · ${first.anime.name}`)}>
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
    {trailer.layer}
  </section>;
}
