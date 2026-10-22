'use client';
import { useSyncExternalStore } from 'react';
import type { Locale } from '@/lib/locales';
const subscribe = () => () => {};
export function EpisodeReleaseTime({ airingAt, locale }: { airingAt: number; locale: Locale }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const iso = new Date(airingAt * 1000).toISOString();
  const label = mounted ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'long', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date(iso)) : `${iso} (UTC)`;
  return <time dateTime={iso}>{label}</time>;
}
