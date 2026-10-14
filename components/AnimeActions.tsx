'use client';
import { WatchlistButton } from '@/components/Watchlist';
import { getDictionary, type Locale } from '@/lib/i18n';
import styles from './AnimeActions.module.css';

export function AnimeActions({ watchlistId, animeId, locale, placement = 'weekly' }: {
  watchlistId: string;
  animeId?: number | null;
  locale: Locale;
  placement?: 'weekly' | 'detail';
}) {
  const calendarLabel = getDictionary(locale).features.calendar;
  const hasCalendar = Number.isSafeInteger(animeId) && animeId! > 0 && animeId! <= 2147483647;
  return <div className={`${styles.actions} ${placement === 'weekly' ? styles.weekly : styles.detail}`}>
    <WatchlistButton id={watchlistId} />
    {hasCalendar && <a className={styles.calendar} href={`/api/ics/anime/${animeId}`} download={`anime-${animeId}.ics`} aria-label={calendarLabel} title={calendarLabel}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 11h18m-6 3v5m-2.5-2.5h5" />
      </svg>
    </a>}
  </div>;
}
