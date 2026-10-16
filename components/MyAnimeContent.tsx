'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { formatVisitorDate } from '@/lib/visitor-time';
import { groupPersonalReleases } from '@/lib/my-anime-week';
import { MyAnimeStats } from '@/components/MyAnimeStats';
import type { PersonalWeekData } from '@/lib/my-anime-data';
import { withTimeout } from '@/lib/async-timeout';

const names = { trakt: 'Trakt', mal: 'MyAnimeList', anilist: 'AniList' };
export function MyAnimeContent({ providers, connected, data, start, end, authError }: {
  providers: { trakt: boolean; mal: boolean }; connected: { trakt: boolean; mal: boolean };
  data: PersonalWeekData | null; start: string; end: string; authError: boolean;
}) {
  const locale = useLocale(), d = getDictionary(locale).myAnime, router = useRouter();
  const [updating, setUpdating] = useState(false), [statsLoading, setStatsLoading] = useState(connected.trakt);
  const [refreshKey, setRefreshKey] = useState(0), [refreshError, setRefreshError] = useState<'cooldown' | 'error' | null>(null);
  const groups = groupPersonalReleases(data?.releases ?? []);
  const days = [...new Set(groups.map(group => group.day))];
  const time = (at: number) => new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(at);
  async function refresh() {
    setUpdating(true); setRefreshError(null);
    try {
      const response = await withTimeout(fetch('/api/my-anime/refresh', { method: 'POST', signal: AbortSignal.timeout(10000) }), 10000);
      if (!response.ok) { setRefreshError(response.status === 429 ? 'cooldown' : 'error'); return; }
      setRefreshKey(value => value + 1); router.refresh();
    } catch { setRefreshError('error'); }
    finally { setUpdating(false); }
  }
  return <main className="my-anime" lang={locale}>
    <header className="my-anime-heading"><p className="eyebrow">{d.week.replace('{start}', formatVisitorDate(start, locale)).replace('{end}', formatVisitorDate(end, locale))}</p>
      <h1>{d.title}<span aria-hidden="true">.</span></h1><p>{d.description}</p><p className="my-anime-note">{d.timezone}</p></header>
    {authError && <p className="my-anime-notice" role="alert">{d.authError}</p>}
    {!data && <p>{d.connectIntro}</p>}
    <div className="my-anime-connections">
      {(['trakt', 'mal'] as const).filter(provider => providers[provider]).map(provider => <section key={provider} className="my-anime-connection" aria-label={names[provider]}>
        <span className={`my-anime-provider-icon my-anime-provider-${provider}`} aria-hidden="true">{provider === 'trakt' ? '↗' : 'M'}</span>
        {connected[provider] ? <><span>{d.connected.replace('{provider}', names[provider])}</span>
          <form method="post" action={`/api/auth/${provider}/logout`}><button type="submit">{d.disconnect.replace('{provider}', names[provider])}</button></form></>
          : <a className="my-anime-connect" href={`/api/auth/${provider}/login`}>{d.connect.replace('{provider}', names[provider])}</a>}
      </section>)}
    </div>
    {connected.trakt && <MyAnimeStats locale={locale} refreshKey={refreshKey} onLoadingChange={setStatsLoading} />}
    {data && <section aria-label={d.weekLabel} className="my-anime-calendar">
      <header className="my-anime-calendar-heading"><div><p className="eyebrow">{d.animeOnly}</p><h2>{d.calendarTitle}</h2><p className="my-anime-note">{d.animeOnlyNote}</p></div>
        <button type="button" className="my-anime-refresh" disabled={updating || (connected.trakt && statsLoading)} onClick={refresh}><span aria-hidden="true">↻</span> {updating ? d.refreshing : d.refresh}</button></header>
      {refreshError && <p className="my-anime-notice" role="status">{refreshError === 'cooldown' ? d.refreshCooldown : d.refreshError}</p>}
      {!!data.unavailable.length && <p className="my-anime-notice" role="status">{d.unavailable.replace('{providers}', data.unavailable.map(provider => names[provider]).join(', '))}</p>}
      {!!data.unmatched && <p className="my-anime-note">{d.unmatched.replace('{count}', String(data.unmatched))}</p>}
      {!data.releases.length && <p className="empty-state" role="status">{data.followed === 0 && !data.unavailable.length ? d.noFollows : d.empty}</p>}
      {days.map(date => <section key={date} className="my-anime-day"><h3><span className="my-anime-day-number">{formatVisitorDate(date, locale, 'Europe/Rome', { day: '2-digit' })}</span>{formatVisitorDate(date, locale, 'Europe/Rome', { weekday: 'long', month: 'long' })}</h3>
        <ul className="my-anime-release-grid">{groups.filter(group => group.day === date).map(group => {
          const commonTime = group.episodes.every(episode => episode.airingAt === group.episodes[0].airingAt);
          return <li key={group.key} className="my-anime-release-card">
            <div className="my-anime-release-poster">{group.poster ? <Image src={group.poster} alt="" fill sizes="(max-width: 600px) 76px, 106px" /> : <span role="img" aria-label={d.noCover}>✦</span>}</div>
            <div className="my-anime-release-info"><div className="my-anime-release-top"><span className="my-anime-source">{group.sources.map(source => names[source]).join(' · ')}</span>
              {commonTime && <time dateTime={new Date(group.episodes[0].airingAt).toISOString()}>{time(group.episodes[0].airingAt)}</time>}</div>
              <h4>{group.anilistId ? <Link prefetch={false} href={`/anime/${group.anilistId}`} title={d.details}>{group.title}</Link> : group.title}</h4>
              {group.episodes.length > 1 && <p className="my-anime-batch">{d.episodeBatch.replace('{count}', String(group.episodes.length))}</p>}
              <ul className="my-anime-episode-chips">{group.episodes.map(episode => <li key={episode.key}>
                {!commonTime && <time dateTime={new Date(episode.airingAt).toISOString()}>{time(episode.airingAt)}</time>}
                <span>{episode.season === 0 ? d.special.replace('{number}', String(episode.episode)) : <>{episode.season != null && <>{d.season.replace('{number}', String(episode.season))} · </>}{d.episode.replace('{number}', String(episode.episode))}</>}</span>
                {episode.episodeTitle && <span className="my-anime-episode-title">{episode.episodeTitle}</span>}
              </li>)}</ul>
            </div>
          </li>;
        })}</ul>
      </section>)}
    </section>}
  </main>;
}
