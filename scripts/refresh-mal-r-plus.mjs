#!/usr/bin/env node
// Seasonal refresh of the MAL "R+ - Mild Nudity" ID list used by search.
// Usage: node scripts/refresh-mal-r-plus.mjs  → rewrites data/mal-r-plus.json, then commit/PR it.
// Writes only after every Jikan page validates; on any failure the committed list is kept.
import { readFile, writeFile } from 'node:fs/promises';
const OUT = new URL('../data/mal-r-plus.json', import.meta.url);
const MAX_PAGES = 40;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const valid = id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
async function page(n) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${process.env.MAL_API_BASE ?? 'https://api.tenrai.org/v1'}/anime?rating=r&limit=100&page=${n}`, { signal: AbortSignal.timeout(20000) });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Jikan ${res.status} on page ${n}`);
    return res.json();
  }
  throw new Error(`Jikan retries exhausted on page ${n}`);
}
async function main() {
  const ids = new Set();
  let complete = false;
  for (let n = 1; n <= MAX_PAGES; n++) {
    const r = await page(n);
    if (!Array.isArray(r.data) || r.pagination?.current_page !== n || !r.data.length
      || r.data.some(e => !valid(e.mal_id) || e.rating !== 'R+ - Mild Nudity')) throw new Error(`Invalid page ${n}`);
    const before = ids.size;
    for (const e of r.data) ids.add(e.mal_id);
    if (!r.pagination.has_next_page) { complete = true; break; }
    if (ids.size === before) throw new Error(`Repeated page ${n}`);
    await sleep(1100);
  }
  if (!complete) throw new Error('Incomplete pagination');
  const prev = JSON.parse(await readFile(OUT, 'utf8').catch(() => '{"ids":[]}'));
  if (prev.ids?.length && ids.size < prev.ids.length * 0.8) throw new Error(`Suspicious shrink ${prev.ids.length} → ${ids.size}`);
  const index = { version: 1, rating: 'R+', savedAt: new Date().toISOString(), ids: [...ids].sort((a, b) => a - b) };
  await writeFile(OUT, JSON.stringify(index) + '\n');
  console.log(`mal-r-plus: ${prev.ids?.length ?? 0} → ${ids.size} IDs`);
}
main().catch(e => { console.error('[mal-r-plus] refresh failed; keeping committed list:', e.message); process.exit(1); });
