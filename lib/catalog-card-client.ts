'use client';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';
import { formatRating } from '@/lib/ratings';
import { withTimeout } from '@/lib/async-timeout';
interface Entry {
  expires: number; promise: Promise<CatalogCardSummary>; controller: AbortController;
  subscribers: number; pinned: boolean; settled: boolean; reject: (reason: unknown) => void;
}
const requests = new Map<number, Entry>();
const queue: { entry: Entry; run: () => Promise<void> }[] = [];
let active = 0;
const aborted = () => new DOMException('Card is no longer visible', 'AbortError');
function pump() {
  while (active < 2 && queue.length) {
    const task = queue.shift()!;
    if (task.entry.controller.signal.aborted) continue;
    active++;
    void task.run().finally(() => { active--; pump(); });
  }
}
function subscribe(id: number, entry: Entry, signal?: AbortSignal): Promise<CatalogCardSummary> {
  if (!signal) { entry.pinned = true; return entry.promise; }
  if (signal.aborted) return Promise.reject(aborted());
  entry.subscribers++;
  return new Promise((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true; entry.subscribers--; signal.removeEventListener('abort', cancel);
      if (!entry.settled && !entry.pinned && entry.subscribers === 0) {
        entry.controller.abort(); entry.reject(aborted());
        if (requests.get(id) === entry) requests.delete(id);
      }
    };
    const cancel = () => { release(); reject(aborted()); };
    signal.addEventListener('abort', cancel, { once: true });
    entry.promise.then(value => { release(); resolve(value); }, error => { release(); reject(error); });
  });
}
export function invalidateCatalogCard(id: number) { requests.delete(id); }
export function loadCatalogCard(id: number, signal?: AbortSignal): Promise<CatalogCardSummary> {
  if (signal?.aborted) return Promise.reject(aborted());
  let entry = requests.get(id);
  if (entry && entry.expires > Date.now()) return subscribe(id, entry, signal);
  let resolve!: (value: CatalogCardSummary) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<CatalogCardSummary>((yes, no) => { resolve = yes; reject = no; });
  entry = { expires: Infinity, promise, controller: new AbortController(), subscribers: 0, pinned: false, settled: false, reject };
  const current = entry;
  // Include time spent waiting for a slot and parsing the response body. Abort
  // alone cannot settle a queued request or a stalled body reader.
  const timer = setTimeout(() => {
    current.settled = true; current.controller.abort();
    if (requests.get(id) === current) requests.delete(id);
    reject(new Error('Catalog card timed out'));
  }, 60000);
  void promise.finally(() => clearTimeout(timer)).catch(() => {});
  queue.push({ entry: current, run: async () => {
    try {
      const result = await withTimeout((async () => {
        // The response now includes the same series-level offers as details.
        // Bypass any pre-fix CDN response that omitted this fallback.
        const response = await fetch(`/api/anime-card/${id}?ratings=v3&watch=v3`, { cache: 'no-store', signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(45000)]) });
        if (!response.ok) throw new Error('Catalog card unavailable');
        return await response.json() as CatalogCardSummary;
      })(), 45000);
      if (current.controller.signal.aborted) throw aborted();
      if (result.ratings?.anilistId !== id || !result.availability?.providers) throw new Error('Invalid catalog card');
      current.settled = true;
      // Missing scores may be transient. Do not retain them as a successful lookup.
      if (formatRating(result.ratings.imdbRating) === 'n/a' || result.ratings.imdbStatus === 'error' || result.ratings.imdbStatus === 'unconfigured') {
        if (requests.get(id) === current) requests.delete(id);
      } else current.expires = Date.now() + 600000;
      resolve(result);
    } catch (error) {
      current.controller.abort();
      current.settled = true;
      if (requests.get(id) === current) requests.delete(id);
      reject(error);
    }
  } });
  if (requests.size >= 100) requests.delete(requests.keys().next().value!);
  requests.set(id, current);
  const result = subscribe(id, current, signal);
  pump();
  return result;
}
