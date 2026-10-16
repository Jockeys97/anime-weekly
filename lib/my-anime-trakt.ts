import 'server-only';
import { traktFetch } from '@/lib/my-anime-auth';
import { traktHeaders } from '@/lib/trakt-headers';
import { withTimeout } from '@/lib/async-timeout';

export async function traktJson<T>(path: string, token: string, maxWaitMs: number): Promise<{ data: T | null; pages: number }> {
  return withTimeout(readTraktJson<T>(path, token, maxWaitMs), Math.max(1, maxWaitMs));
}
async function readTraktJson<T>(path: string, token: string, maxWaitMs: number): Promise<{ data: T | null; pages: number }> {
  const response = await traktFetch(`https://api.trakt.tv${path}`, { cache: 'no-store', next: undefined, headers: traktHeaders(token) }, maxWaitMs);
  if (!response.ok) throw new Error('Trakt unavailable');
  const value = Number(response.headers.get('X-Pagination-Page-Count') || 1);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid pagination');
  return { data: response.status === 204 ? null : await response.json() as T, pages: value };
}
