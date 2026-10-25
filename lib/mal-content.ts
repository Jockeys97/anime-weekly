import 'server-only';
import index from '@/data/mal-r-plus.json';

/**
 * MAL "R+ - Mild Nudity" IDs, committed in data/mal-r-plus.json and bundled at
 * build time: no Blob, no network on search. Refresh seasonally with
 * `node scripts/refresh-mal-r-plus.mjs` (it only overwrites the file after a
 * complete, validated crawl, so a failed refresh keeps the last committed list).
 */
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0 && Number(id) <= 2147483647;
const IDS: readonly number[] | null = (() => {
  const ids: unknown = (index as { ids?: unknown }).ids;
  return Array.isArray(ids) && ids.length > 0 && ids.every(validId) ? ids : null;
})();

export async function readMildNudityIds(): Promise<number[] | null> {
  return IDS ? [...IDS] : null;
}
