'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { calendarDate, formatVisitorDate } from '@/lib/visitor-time';
import type { PersonalWeekData } from '@/lib/my-anime-data';

const names = { trakt: 'Trakt', mal: 'MyAnimeList', anilist: 'AniList' };
export function MyAnimeContent({ providers, connected, data, start, end, authError }: {
  providers: { trakt: boolean; mal: boolean }; connected: { trakt: boolean; mal: boolean };
  data: PersonalWeekData | null; start: string; end: string; authError: boolean;
}) {
  const locale = useLocale(), d = getDictionary(locale).myAnime, router = useRouter();
  const days = [...new Set(data?.releases.map(release => calendarDate(release.airingAt, 'Europe/Rome')) ?? [])];
  return <main className="my-anime" lang={locale}>
    <header className="my-anime-heading"><p className="eyebrow">{d.week.replace('{start}', formatVisitorDate(start, locale)).replace('{end}', formatVisitorDate(end, locale))}</p>
      <h1>{d.title}</h1><p>{d.description}</p><p className="my-anime-note">{d.timezone}</p></header>
    {authError && <p className="my-anime-notice" role="alert">{d.authError}</p>}
    {!data && <p>{d.connectIntro}</p>}
    <div className="my-anime-connections">
      {(['trakt', 'mal'] as const).filter(provider => providers[provider]).map(provider => <section key={provider} className="my-anime-connection" aria-label={names[provider]}>
        {connected[provider] ? <><span>{d.connected.replace('{provider}', names[provider])}</span>
          <form method="post" action={`/api/auth/${provider}/logout`}><button type="submit">{d.disconnect.replace('{provider}', names[provider])}</button></form></>
          : <a className="my-anime-connect" href={`/api/auth/${provider}/login`}>{d.connect.replace('{provider}', names[provider])}</a>}
      </section>)}
    </div>
    {data && <section aria-label={d.weekLabel}>
      <button type="button" className="my-anime-refresh" onClick={() => router.refresh()}>{d.refresh}</button>
      {!!data.unavailable.length && <p className="my-anime-notice" role="status">{d.unavailable.replace('{providers}', data.unavailable.map(provider => names[provider]).join(', '))}</p>}
      {!!data.unmatched && <p className="my-anime-note">{d.unmatched.replace('{count}', String(data.unmatched))}</p>}
      {!data.releases.length && <p className="empty-state" role="status">{data.followed === 0 && !data.unavailable.length ? d.noFollows : d.empty}</p>}
      {days.map(date => <section key={date} className="my-anime-day"><h2>{formatVisitorDate(date, locale, 'Europe/Rome', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <ul>{data.releases.filter(release => calendarDate(release.airingAt, 'Europe/Rome') === date).map(release => <li key={release.key}>
          <time dateTime={new Date(release.airingAt).toISOString()}>{new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(release.airingAt)}</time>
          <div>{release.anilistId ? <Link prefetch={false} href={`/anime/${release.anilistId}`} title={d.details}>{release.title}</Link> : <strong>{release.title}</strong>}
            <p>{release.season != null && <>{d.season.replace('{number}', String(release.season))} · </>}{d.episode.replace('{number}', String(release.episode))}</p></div>
          <span className="my-anime-source">{release.sources.map(source => names[source]).join(' · ')}</span>
        </li>)}</ul>
      </section>)}
    </section>}
  </main>;
}
