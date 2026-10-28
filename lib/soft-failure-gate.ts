import 'server-only';
import { NextResponse } from 'next/server';
// Imported directly (not lib/runtime-cache): its filesystem fallback would
// make Turbopack trace the whole project into the proxy bundle. Off Vercel,
// getCache falls back to an in-memory cache.
import { getCache } from '@vercel/functions';

// Short-lived mark set when a detail render fails on a transient AniList
// error. It never answers a 503 by itself: proxy.ts probes the cached page
// first and only returns 503 when no last-good copy can be served.
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

// Standalone document: no layout homepage metadata can be inherited.
export const UNAVAILABLE_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="20"><title>Temporarily unavailable · Weekly Anime</title><meta property="og:title" content="Temporarily unavailable · Weekly Anime"></head><body><p>Temporarily unavailable, retrying shortly…</p></body></html>';
export function animeUnavailableResponse(): NextResponse {
  return new NextResponse(UNAVAILABLE_HTML, { status: 503, headers: {
    'X-Robots-Tag': 'noindex, follow', 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(SOFT_FAILURE_RETRY_AFTER),
  } });
}
