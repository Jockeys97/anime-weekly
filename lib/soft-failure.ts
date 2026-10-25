import type { Metadata } from 'next';
import { siteUrl } from '@/lib/seo';
import { markAnimeUnavailable } from '@/lib/soft-failure-gate';

// Seconds a transient-failure (AniList 429/timeout) soft page may stay in ISR.
export const SOFT_FAILURE_REVALIDATE = 60;

// Without cacheComponents, a route's ISR lifetime is the lowest fetch
// revalidate seen during render. One tiny cached fetch therefore shortens a
// soft page from the 24h default to 60s, so it is never a long-lived false
// page and never a cached 404. Only runs on the failure path.
export async function shortenSoftFailureCache(): Promise<void> {
  await fetch(new URL('/robots.txt', siteUrl()), { next: { revalidate: SOFT_FAILURE_REVALIDATE } })
    .then(response => response.body?.cancel())
    .catch(() => undefined);
}

// Resolves the anime; a transient failure (thrown) becomes `undefined` after
// shortening the page cache. `null` still means a confirmed not-found.
export async function softLookup<T>(work: () => Promise<T>, context: Record<string, unknown>): Promise<T | undefined> {
  try { return await work(); }
  catch (error) {
    console.warn('[anime-detail] transient lookup failure', { ...context, message: error instanceof Error ? error.message : 'Unknown error' });
    // This render is still a 200 soft page (ISR cannot change status); the
    // mark makes proxy.ts answer the following requests with a real 503.
    await Promise.all([shortenSoftFailureCache(), typeof context.id === 'number' ? markAnimeUnavailable(context.id) : undefined]);
    return undefined;
  }
}

// Metadata for a soft page. A page cannot change its HTTP status under ISR,
// so it stays 200 + noindex,follow, but must not inherit the layout's
// homepage canonical/hreflang: that would tell Google this URL duplicates
// the home page. `null` clears the inherited alternates entirely.
export function softFailureMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: true }, alternates: null };
}
