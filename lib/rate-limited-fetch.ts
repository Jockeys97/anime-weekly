import 'server-only';
import { CACHE_SECONDS, CACHE_TAG } from '@/lib/config';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function throttle(spacing: number, timeoutMs = 10000) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart: number | undefined;
  let cooldownUntil = 0;
  return (url: string, init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {}, maxWaitMs?: number): Promise<Response> => {
    const deadline = maxWaitMs == null ? undefined : Date.now() + Math.max(0, maxWaitMs);
    const request = tail.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (deadline != null && Date.now() >= deadline) return new Response(null, { status: 429 });
        // A long service-wide Retry-After applies to later queued lookups too.
        // Decline optional work instead of holding a visitor or cron open.
        if (cooldownUntil - Date.now() > 10000 || (deadline != null && cooldownUntil >= deadline)) return new Response(null, { status: 429 });
        if (cooldownUntil > Date.now()) await sleep(cooldownUntil - Date.now());
        if (lastStart != null) await sleep(Math.max(0, lastStart + spacing - Date.now()));
        if (deadline != null && Date.now() >= deadline) return new Response(null, { status: 429 });
        lastStart = Date.now();
        const response = await fetch(url, { cache: 'force-cache', next: { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] }, ...init, signal: AbortSignal.timeout(deadline == null ? timeoutMs : Math.max(1, Math.min(timeoutMs, deadline - Date.now()))) });
        if (response.status !== 429 && (init.cache !== 'no-store' || response.status < 500)) return response;
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
        const retryMs = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
        if (response.status === 429) cooldownUntil = Date.now() + Math.max(spacing * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0);
        if (attempt === 2) return response;
        // Respect long Retry-After by declining this optional lookup, never retrying early.
        if (retryMs > 10000) return response;
        await response.body?.cancel();
        await sleep(Math.max(spacing * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0));
      }
      throw new Error('Retry limit reached');
    });
    tail = request.catch(() => undefined);
    if (maxWaitMs == null) return request;
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(null, { status: 429 })), Math.max(0, maxWaitMs));
      request.then(response => { clearTimeout(timer); resolve(response); }, error => { clearTimeout(timer); reject(error); });
    });
  };
}

// One process-wide AniList queue, shared by catalog and weekly rating lookups.
// 800ms between attempts stays below 90/minute while fitting a 40-title cron.
export const anilistFetch = throttle(800);
