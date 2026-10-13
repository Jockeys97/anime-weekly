'use client';

import type { CatalogCardSummary } from '@/lib/catalog-card-summary';

// Browser-side deduplication and bounded concurrency for visible catalog cards.
const requests = new Map<number, { expires: number; promise: Promise<CatalogCardSummary> }>();
const queue: (() => Promise<void>)[] = [];
let active = 0;
function pump() {
  while (active < 2 && queue.length) {
    const task = queue.shift()!;
    active++;
    void task().finally(() => { active--; pump(); });
  }
}
export function loadCatalogCard(id: number): Promise<CatalogCardSummary> {
  const existing = requests.get(id);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = new Promise<CatalogCardSummary>((resolve, reject) => {
    queue.push(async () => {
      try {
        const response = await fetch(`/api/anime-card/${id}`, { signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error('Catalog card unavailable');
        const result = await response.json() as CatalogCardSummary;
        if (result.ratings?.anilistId !== id || !result.availability?.providers) throw new Error('Invalid catalog card');
        const entry = requests.get(id);
        if (entry?.promise === promise) entry.expires = Date.now() + 60000;
        resolve(result);
      } catch (error) { if (requests.get(id)?.promise === promise) requests.delete(id); reject(error); }
    });
  });
  if (requests.size >= 100) requests.delete(requests.keys().next().value!);
  requests.set(id, { expires: Infinity, promise });
  pump();
  return promise;
}
