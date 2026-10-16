import 'server-only';
import { unstable_cache } from 'next/cache';
import { withTimeout } from '@/lib/async-timeout';
import { DUB_LANGUAGES, dubbingForMal, parseDubIndex, validMalId, type DubIndex, type DubbingResult } from '@/lib/dubbing';
import type { Locale } from '@/lib/locales';

export const MYDUBLIST_REVALIDATE = 86400;
const cachedIndex = unstable_cache(async (locale: Locale): Promise<DubIndex> => {
  const url = `https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/confidence/low/dubbed_${DUB_LANGUAGES[locale].file}.json`;
  return withTimeout((async () => {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Dub dataset unavailable');
    const text = await response.text();
    if (text.length > 2000000) throw new Error('Dub dataset too large');
    return parseDubIndex(JSON.parse(text), locale, new Date().toISOString());
  })(), 5000);
}, ['mydublist-index-v1'], { revalidate: MYDUBLIST_REVALIDATE, tags: ['mydublist'] });

const pending = new Map<Locale, Promise<DubIndex>>();
const failedAt = new Map<Locale, number>();
function getIndex(locale: Locale): Promise<DubIndex> {
  const previous = pending.get(locale);
  if (previous) return previous;
  // An outage is not a valid daily negative result. A short cooldown prevents
  // all visible cards from retrying the same failed language file at once.
  if (Date.now() - (failedAt.get(locale) ?? -Infinity) < 60000) return Promise.reject(new Error('Dub dataset cooling down'));
  const request = cachedIndex(locale).then(index => { failedAt.delete(locale); return index; })
    .catch(error => { failedAt.set(locale, Date.now()); throw error; }).finally(() => pending.delete(locale));
  pending.set(locale, request);
  return request;
}
export async function getDubbing(malId: number | null | undefined, language: Locale): Promise<DubbingResult> {
  if (!validMalId(malId)) return { status: 'unverified', language, reason: 'identity' };
  try { return dubbingForMal(await getIndex(language), malId, language); }
  catch { return { status: 'unverified', language, malId, reason: 'upstream' }; }
}
