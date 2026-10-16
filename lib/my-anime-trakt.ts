import 'server-only';
import { traktFetch } from '@/lib/my-anime-auth';
import { traktHeaders } from '@/lib/trakt-headers';
import { withTimeout } from '@/lib/async-timeout';

export async function traktJson<T>(path: string, token: string, maxWaitMs: number): Promise<{ data: T | null; pages: number }> {
  return withTimeout(readTraktJson<T>(path, token, maxWaitMs), Math.max(1, maxWaitMs));
}
async function readTraktJson<T>(path: string, token: string, maxWaitMs: number): Promise<{ data: T | null; pages: number }> {
  const response = await traktFetch(`https://api.trakt.tv${path}`, { cache: 'no-store', next: undefined, headers: traktHeaders(token) }, maxWaitMs);
  if (!response.ok) {
    // Only endpoint and status: never log tokens, headers or watched content.
    console.warn('[my-anime] Trakt request failed', path.split('?')[0], response.status);
    throw new Error('Trakt unavailable');
  }
  const value = Number(response.headers.get('X-Pagination-Page-Count') || 1);
  const data = response.status === 204 ? null : await response.json() as T;
  // Trakt can report zero pages for an empty history or watchlist.
  if (!Number.isSafeInteger(value) || value < 0 || (value === 0 && data !== null && (!Array.isArray(data) || data.length > 0))) throw new Error('Invalid pagination');
  return { data, pages: Math.max(1, value) };
}
