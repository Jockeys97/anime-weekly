import type { Metadata } from 'next';
import { markAnimeUnavailable } from '@/lib/soft-failure-gate';
// A failed regeneration must reject: ISR retains the last successful HTML/RSC.
// It also marks the gate so proxy.ts can answer a URL with no cached copy
// with an uncached 503 + Retry-After instead of an HTTP 500 (the proxy first
// probes the cache, so a last-good page is never masked).
export async function softLookup<T>(work: () => Promise<T>, context: Record<string, unknown>): Promise<T> {
  try { return await work(); }
  catch (error) {
    console.warn('[anime-detail] transient lookup failure', { ...context, message: error instanceof Error ? error.message : 'Unknown error' });
    if (typeof context.id === 'number') await markAnimeUnavailable(context.id);
    throw error;
  }
}

// Clear inherited homepage social metadata and canonical links.
export function softFailureMetadata(_title?: string): Metadata {
  return {
    title: { absolute: 'Temporarily unavailable · Weekly Anime' },
    robots: { index: false, follow: true }, alternates: null,
    openGraph: { title: 'Temporarily unavailable · Weekly Anime', description: 'Please try again shortly.' },
    twitter: { card: 'summary', title: 'Temporarily unavailable · Weekly Anime', description: 'Please try again shortly.', images: [] },
  };
}
