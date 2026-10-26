import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readMildNudityIds } from '@/lib/mal-content';
import index from '@/data/mal-r-plus.json';

it('serves the committed MAL R+ list without Blob or network', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const ids = await readMildNudityIds();
  expect(ids).not.toBeNull();
  expect(ids!.length).toBeGreaterThan(1000);
  expect(ids).toContain(257); // Ikkitousen
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('ships a valid, sorted, unique R+ index', () => {
  expect(index.version).toBe(1); expect(index.rating).toBe('R+');
  expect(Number.isFinite(Date.parse(index.savedAt))).toBe(true);
  expect(new Set(index.ids).size).toBe(index.ids.length);
  expect([...index.ids].sort((a, b) => a - b)).toEqual(index.ids);
});
import { readHentaiIds } from '@/lib/mal-content';
import hxIndex from '@/data/mal-hx.json';
it('serves the committed MAL Hx list without network', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const ids = await readHentaiIds();
  expect(ids!.length).toBeGreaterThan(1000);
  expect(ids).toContain(188); // Gosenzo San'e
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('ships a valid, sorted, unique Hx index disjoint from R+', () => {
  expect(hxIndex.version).toBe(1); expect(hxIndex.rating).toBe('Hx');
  expect(Number.isFinite(Date.parse(hxIndex.savedAt))).toBe(true);
  expect(new Set(hxIndex.ids).size).toBe(hxIndex.ids.length);
  expect([...hxIndex.ids].sort((a, b) => a - b)).toEqual(hxIndex.ids);
  const rplus = new Set(index.ids); expect(hxIndex.ids.some(id => rplus.has(id))).toBe(false);
});
