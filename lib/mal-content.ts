import 'server-only';
import index from '@/data/mal-r-plus.json';
import hxIndex from '@/data/mal-hx.json';

/**
 * MAL "R+ - Mild Nudity" IDs, committed in data/mal-r-plus.json and bundled at
 * build time: no Blob, no network on search. Refresh seasonally with
 * `node scripts/refresh-mal-r-plus.mjs` (it only overwrites the file after a
 * complete, validated crawl, so a failed refresh keeps the last committed list).
 */
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0 && Number(id) <= 2147483647;
const load = (source: unknown): readonly number[] | null => {
  const ids: unknown = (source as { ids?: unknown }).ids;
  return Array.isArray(ids) && ids.length > 0 && ids.every(validId) ? ids : null;
};
const IDS = load(index);
/** MAL "Rx - Hentai" (Hx) IDs from data/mal-hx.json (refresh: scripts/refresh-mal-hx.mjs). */
const HX_IDS = load(hxIndex);

export async function readMildNudityIds(): Promise<number[] | null> {
  return IDS ? [...IDS] : null;
}

export async function readHentaiIds(): Promise<number[] | null> {
  return HX_IDS ? [...HX_IDS] : null;
}

/** Which Search content landing an anime belongs to (Hx wins over R+). */
export function malContentPreset(anime: { idMal?: number | null; isAdult?: boolean | null }): 'hentai' | 'mild-nudity' | undefined {
  const id = anime.idMal ?? 0;
  if (anime.isAdult === true || (id && HX_IDS?.includes(id))) return 'hentai';
  if (id && IDS?.includes(id)) return 'mild-nudity';
  return undefined;
}
