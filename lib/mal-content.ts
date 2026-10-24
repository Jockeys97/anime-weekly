import 'server-only';
import { get, put } from '@vercel/blob';
import { unstable_cache, revalidateTag } from 'next/cache';
import { MAL_API_BASE } from '@/lib/mal-provider';
import { jikanFetch } from '@/lib/rate-limited-fetch';

const KEY = 'mal/content/r-plus-v1.json';
const TAG = 'mal-content-r-plus';
const MAX_PAGES = 40;
const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0 && Number(id) <= 2147483647;
interface ContentIndex { version: 1; rating: 'R+'; savedAt: string; ids: number[] }
function validIndex(value: unknown): value is ContentIndex {
  if (!value || typeof value !== 'object') return false;
  const index = value as ContentIndex;
  return index.version === 1 && index.rating === 'R+' && Number.isFinite(Date.parse(index.savedAt))
    && Array.isArray(index.ids) && index.ids.length > 0 && index.ids.length <= MAX_PAGES * 100
    && index.ids.every(validId) && new Set(index.ids).size === index.ids.length;
}
async function readFile(): Promise<ContentIndex> {
  const file = await get(KEY, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(3000) });
  if (!file || file.statusCode !== 200) throw new Error('MAL content index unavailable');
  const index: unknown = await new Response(file.stream).json();
  if (!validIndex(index)) throw new Error('Invalid MAL content index');
  return index;
}
const cachedIndex = unstable_cache(readFile, ['mal-content-r-plus-v1'], { revalidate: 300, tags: [TAG] });
/** Read-only: search visits never crawl MAL or cache a missing index. */
export async function readMildNudityIds(): Promise<number[] | null> {
  if (!configured()) return null;
  try { return (await cachedIndex()).ids; } catch { return null; }
}
let pending: Promise<boolean> | undefined;
/** Called by the existing authenticated daily catalog job, never search pages. */
export function refreshMildNudityIndex(): Promise<boolean> {
  if (!configured()) return Promise.resolve(false);
  if (!pending) pending = refresh().finally(() => { pending = undefined; });
  return pending;
}
async function refresh(): Promise<boolean> {
  try {
    try {
      if ((await readFile()).savedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)) return true;
    } catch { /* Bootstrap a missing index. */ }
    const ids = new Set<number>();
    const deadline = Date.now() + 60000;
    let complete = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('MAL content deadline');
      const response = await jikanFetch(`${MAL_API_BASE}/anime?rating=r&limit=100&page=${page}`, { cache: 'no-store', next: undefined }, remaining);
      if (!response.ok) throw new Error('MAL content unavailable');
      const result = await response.json() as { data?: { mal_id?: unknown; rating?: unknown }[]; pagination?: { current_page?: number; has_next_page?: boolean } };
      if (!Array.isArray(result.data) || result.pagination?.current_page !== page || typeof result.pagination.has_next_page !== 'boolean'
        || !result.data.length || result.data.some(entry => !validId(entry.mal_id) || entry.rating !== 'R+ - Mild Nudity')) throw new Error('Invalid MAL content page');
      const before = ids.size;
      for (const entry of result.data) ids.add(entry.mal_id as number);
      if (!result.pagination.has_next_page) { complete = true; break; }
      if (ids.size === before) throw new Error('Repeated MAL content page');
    }
    if (!complete) throw new Error('Incomplete MAL content pagination');
    const index: ContentIndex = { version: 1, rating: 'R+', savedAt: new Date().toISOString(), ids: [...ids].sort((a, b) => a - b) };
    if (!validIndex(index)) throw new Error('Invalid MAL content index');
    await put(KEY, JSON.stringify(index), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', abortSignal: AbortSignal.timeout(10000) });
    revalidateTag(TAG, { expire: 0 });
    return true;
  } catch {
    // Keep yesterday's complete file. Never publish a partial/unknown rating set.
    console.warn('[mal-content] daily refresh unavailable; retaining saved index');
    return false;
  }
}
