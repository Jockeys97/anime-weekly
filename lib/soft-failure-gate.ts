import 'server-only';
import { NextResponse } from 'next/server';
// Imported directly (not lib/runtime-cache): its filesystem fallback would
// make Turbopack trace the whole project into the proxy bundle. Off Vercel,
// getCache falls back to an in-memory cache.
import { getCache } from '@vercel/functions';

// Real 503 for AniList soft failures. An ISR page cannot set its own status,
// so the page records the transient failure here and proxy.ts (which runs
// before the CDN/ISR cache) answers the same anime's detail, episode and
// similar URLs with an uncached 503 + Retry-After while the mark lives.
// The mark outlives the 60s soft ISR copy, so that copy is not served from
// cache to crawlers while AniList is still failing.
export const SOFT_FAILURE_GATE_TTL = 90;
export const SOFT_FAILURE_RETRY_AFTER = 120;
const GATE_READ_TIMEOUT_MS = 150;
const gate = getCache({ namespace: 'anime-weekly-soft-failure-v1' });
const key = (id: number) => `anime:${id}`;

export async function markAnimeUnavailable(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) return;
  try { await gate.set(key(id), 1, { ttl: SOFT_FAILURE_GATE_TTL }); }
  catch (error) { console.warn('[soft-failure] gate write failed', { id, message: error instanceof Error ? error.message : 'Unknown error' }); }
}

export async function clearAnimeUnavailable(id: number): Promise<void> {
  try { await gate.delete(key(id)); } catch { /* best effort */ }
}

// Fail open: a slow or broken cache must never block a normal page.
export async function isAnimeUnavailable(id: number, timeoutMs = GATE_READ_TIMEOUT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      gate.get(key(id)).then(value => value != null),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}

// No noindex: the 503 status plus Retry-After already means "retry later".
export const UNAVAILABLE_HTML = '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="20"><title>503</title><p>Temporarily unavailable, retrying shortly…</p>';
export function animeUnavailableResponse(): NextResponse {
  return new NextResponse(UNAVAILABLE_HTML, { status: 503, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(SOFT_FAILURE_RETRY_AFTER),
  } });
}
