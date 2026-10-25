import { getDictionary, type Locale } from '@/lib/i18n';

// Transient AniList 429/timeout: a retry notice only (no invented data).
// The page sets noindex and lives in ISR for at most 60s (lib/soft-failure).
export function DetailTemporarilyUnavailable({ locale }: { locale: Locale }) {
  const d = getDictionary(locale);
  return <main id="main" className="empty-state"><meta httpEquiv="refresh" content="30" /><h1>{d.error.title}</h1><p>{d.error.body}</p></main>;
}
