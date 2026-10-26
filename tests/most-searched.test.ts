import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { mostSearched } from '../lib/most-searched';
import { animePath } from '../lib/anime-url';
import { getDictionary } from '../lib/i18n';
import { locales } from '../lib/locales';
it('links only verified mainstream editorial IDs from home without runtime discovery', () => {
  expect(mostSearched.length).toBeGreaterThanOrEqual(6);
  expect(mostSearched).toEqual([
    { id: 161645, name: 'The Apothecary Diaries' },
    { id: 185874, name: 'BLEACH: Thousand-Year Blood War - The Calamity' },
    { id: 209872, name: 'Ranma1/2 (2024) Season 3' },
    { id: 97940, name: 'Black Clover' },
    { id: 101922, name: 'Demon Slayer: Kimetsu no Yaiba' },
    { id: 16498, name: 'Attack on Titan' },
    { id: 21, name: 'ONE PIECE' },
    { id: 1735, name: 'Naruto: Shippuden' },
  ]);
  expect(new Set(mostSearched.map(a => a.id)).size).toBe(mostSearched.length);
  expect(new Set(mostSearched.map(a => animePath(a.id, a.name))).size).toBe(mostSearched.length);
  const home = readFileSync(new URL('../app/[locale]/page.tsx', import.meta.url), 'utf8');
  expect(home).toContain('mostSearched.map');
  expect(home).toContain('localePath(animePath(anime.id, anime.name), locale)');
  for (const locale of locales) expect(getDictionary(locale).seo.mostSearched).toBeTruthy();
});

it('excludes adult and Hx IDs and verifies every English title against repository data', () => {
  const adultIds = [213686, 215989, 203367, 214551];
  const hx = JSON.parse(readFileSync(new URL('../data/mal-hx.json', import.meta.url), 'utf8')) as { ids: number[] };
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/season-families.json', import.meta.url), 'utf8')) as {
    media: { id: number; idMal?: number | null; title: { english: string }; isAdult?: boolean }[];
  };
  for (const anime of mostSearched) {
    const verified = fixture.media.find(entry => entry.id === anime.id);
    expect(verified, `Missing fixture for ${anime.id}`).toBeDefined();
    expect(verified?.title.english).toBe(anime.name);
    expect([false, undefined]).toContain(verified?.isAdult);
    expect(adultIds).not.toContain(anime.id);
    expect(hx.ids).not.toContain(anime.id);
    if (verified?.idMal != null) expect(hx.ids).not.toContain(verified.idMal);
  }
});
