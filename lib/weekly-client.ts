'use client';
import { withTimeout } from '@/lib/async-timeout';
import type { WeeklyTitleDetails, WeeklySchedule, WeeklyCalendarSchedule, WeeklyRatingScores } from '@/lib/weekly-details';
import type { PlatformSnapshot } from '@/lib/platform-data';
interface Entry { promise: Promise<unknown>; controller: AbortController; settled: boolean; subscribers: number; expires: number }
const entries = new Map<string, Entry>();
const queue: { entry: Entry; lane: 'calendar' | 'ratings' | 'providers' | 'details'; run: () => Promise<void> }[] = [];
const active = { details: 0, calendar: 0, ratings: 0, providers: 0 };
function pump() {
  while (queue.length) {
    const index = queue.findIndex(task => active[task.lane] < (task.lane === 'details' ? 2 : 1));
    if (index < 0) break;
    const task = queue.splice(index, 1)[0];
    if (task.entry.controller.signal.aborted) continue;
    const lane = task.lane;
    active[lane]++;
    void task.run().finally(() => { active[lane]--; pump(); });
  }
}
export function invalidateWeeklyLookup(url: string) { entries.delete(url); }
export function loadWeeklyLookup<T extends WeeklyTitleDetails | WeeklySchedule | WeeklyCalendarSchedule | WeeklyRatingScores | PlatformSnapshot>(url: string, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  let entry = entries.get(url);
  if (!entry || entry.expires <= Date.now()) {
    const controller = new AbortController();
    let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    entry = { promise, controller, settled: false, subscribers: 0, expires: Infinity };
    const current = entry;
    // A queue deadline also covers cards that never get a network slot.
    const timer = setTimeout(() => {
      controller.abort();
      if (entries.get(url) === current) entries.delete(url);
      reject(new Error('Lookup timed out'));
    }, 60000);
    void promise.finally(() => { clearTimeout(timer); current.settled = true; }).catch(() => {});
    const lane = url.startsWith('/api/weekly-calendar?') ? 'calendar' : url.startsWith('/api/weekly-ratings?') ? 'ratings'
      : url.startsWith('/api/weekly-providers?') || url.startsWith('/api/season-providers?') ? 'providers' : 'details';
    queue.push({ entry: current, lane, run: async () => {
      try {
        const result = await withTimeout((async () => {
          const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(28000)]) });
          if (!response.ok) throw new Error('Weekly lookup unavailable');
          const data = await response.json();
          const valid = lane === 'providers'
            ? data.titles && typeof data.titles === 'object' && !Array.isArray(data.titles) && typeof data.unavailable === 'boolean'
              && Object.values(data.titles).every(value => value && typeof value === 'object' && 'providers' in value && value.providers && typeof value.providers === 'object' && !Array.isArray(value.providers) && 'providersUnavailable' in value && typeof value.providersUnavailable === 'boolean')
            : lane === 'ratings'
            ? data.titles && typeof data.titles === 'object' && !Array.isArray(data.titles) && typeof data.unavailable === 'boolean'
            : url.startsWith('/api/weekly-title?')
            ? Number.isSafeInteger(data.id) && data.providers && typeof data.providersUnavailable === 'boolean' && !('ratings' in data)
            : Array.isArray(data.events) && Array.isArray(data.episodeDates) && typeof data.unavailable === 'boolean'
              && (!url.startsWith('/api/weekly-calendar?') || (data.anilistIds && typeof data.anilistIds === 'object' && !Array.isArray(data.anilistIds)));
          if (!valid) throw new Error('Invalid weekly lookup');
          return data;
        })(), 28000);
        if (result.providersUnavailable || result.unavailable) entries.delete(url);
        else current.expires = Date.now() + 600000;
        resolve(result);
      } catch (error) { controller.abort(); if (entries.get(url) === current) entries.delete(url); reject(error); }
    } });
    if (entries.size >= 200) entries.delete(entries.keys().next().value!);
    entries.set(url, current);
  }
  const current = entry;
  current.subscribers++;
  const subscribed = new Promise<T>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true; signal.removeEventListener('abort', cancel); current.subscribers--;
      if (!current.settled && current.subscribers === 0) {
        current.controller.abort();
        if (entries.get(url) === current) entries.delete(url);
      }
    };
    const cancel = () => { release(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
    current.promise.then(value => { release(); resolve(value as T); }, error => { release(); reject(error); });
  });
  pump();
  return subscribed;
}
