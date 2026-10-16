'use client';
import type { Locale } from '@/lib/locales';
import { validDubbingResult, type DubbingResult } from '@/lib/dubbing';
import { withTimeout } from '@/lib/async-timeout';

const requests = new Map<string, { promise: Promise<DubbingResult>; expires: number }>();
const waiting: Array<() => void> = [];
let active = 0;
function drain() { while (active < 2 && waiting.length) waiting.shift()!(); }
export function loadDubbing(query: string, locale: Locale, malId?: number): Promise<DubbingResult> {
  const key = `${locale}:${query}`;
  const previous = requests.get(key);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const work = new Promise<DubbingResult>((resolve, reject) => {
    waiting.push(() => {
      active++;
      void withTimeout((async () => {
        const response = await fetch(`/api/dubbing?${query}&locale=${locale}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Dub lookup unavailable');
        const result: unknown = await response.json();
        if (!validDubbingResult(result, locale, malId) || result.reason === 'upstream') throw new Error('Invalid dub lookup');
        return result;
      })(), 15000).then(resolve, reject).finally(() => { active--; drain(); });
    });
    drain();
  });
  const promise = work.then(result => {
    requests.set(key, { promise, expires: Date.now() + 86400000 });
    for (const [id, item] of requests) { if (requests.size <= 200) break; if (Number.isFinite(item.expires)) requests.delete(id); }
    return result;
  }).catch(error => { requests.delete(key); throw error; });
  requests.set(key, { promise, expires: Infinity });
  return promise;
}
