import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { mostSearched } from '../lib/most-searched';
import { animePath } from '../lib/anime-url';
import { getDictionary } from '../lib/i18n';
import { locales } from '../lib/locales';
it('links only verified mainstream editorial IDs from home without runtime discovery', () => {
  expect(mostSearched.map(a => a.id)).toEqual([161645]);
  expect(new Set(mostSearched.map(a => animePath(a.id, a.name))).size).toBe(mostSearched.length);
  const home = readFileSync(new URL('../app/[locale]/page.tsx', import.meta.url), 'utf8');
  expect(home).toContain('mostSearched.map');
  expect(home).toContain('localePath(animePath(anime.id, anime.name), locale)');
  for (const locale of locales) expect(getDictionary(locale).seo.mostSearched).toBeTruthy();
});

it('excludes known adult IDs from the homepage selection', () => {
  const adultIds = [213686, 215989, 203367, 214551];
  expect(mostSearched.every(anime => !adultIds.includes(anime.id))).toBe(true);
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/season-families.json', import.meta.url), 'utf8'));
  for (const anime of mostSearched) expect(fixture.cases.some((entry: { rootId: number }) => entry.rootId === anime.id)).toBe(true);
});
