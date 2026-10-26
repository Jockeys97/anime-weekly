import { expect, it } from 'vitest';
import { animeDetailSeo } from '../lib/anime-seo';
import { animeAlternateNames } from '../lib/anime-titles';
import { locales } from '../lib/locales';
import { animeSeoRegressionExamples } from './fixtures/anime-detail-seo';

it.each(locales)('uses factual context and aliases in descriptions, not titles (%s)', locale => {
  for (const { anime, name, ratings } of animeSeoRegressionExamples) {
    const seo = animeDetailSeo(name, anime, 'Synopsis.', locale, ratings);
    expect(seo.title).not.toContain('IMDb');
    expect(seo.title).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}]/u);
    expect(seo.description.length).toBeLessThanOrEqual(160);
    expect(seo.description).not.toContain(seo.title);
    if (ratings.imdbRating) expect(seo.description).toContain(`IMDb ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(ratings.imdbRating))}`);
  }
});
it('keeps at least four whole romaji words and strips trailing periods', () => {
  const { anime } = animeSeoRegressionExamples[0];
  expect(animeDetailSeo('Ochiru Part Tsuma Toshishita ' + 'long '.repeat(30), anime, '', 'it').title).toContain('Ochiru Part Tsuma Toshishita');
  expect(animeDetailSeo('Mou Ichido, Shitemitai.', { ...anime, format: 'OVA' }, '', 'it').title).toBe('Mou Ichido, Shitemitai OVA – dove vederlo e data di uscita');
});
it('includes and deduplicates every published synonym', () => {
  expect(animeAlternateNames('Example', { english: 'Example', romaji: 'Romaji', native: '日本語' }, ['Alias', 'Alias', 'ＥＸＡＭＰＬＥ', '別名'])).toEqual(['Romaji', '日本語', 'Alias', '別名']);
});
it('labels adult titles as hentai and keeps the next episode date (es)', () => {
  const { anime } = animeSeoRegressionExamples[0];
  const airingAt = Date.UTC(2026, 10, 26, 15) / 1000;
  const adult = { ...anime, format: 'OVA', isAdult: true, nextAiringEpisode: { episode: 2, airingAt, timeUntilAiring: 1 } };
  const seo = animeDetailSeo('NTR Kishi', adult as never, '', 'es');
  expect(seo.title).toMatch(/^NTR Kishi hentai OVA episodio 2: estreno 26 nov/);
  expect(seo.title.length).toBeLessThanOrEqual(75);
  expect(seo.description).toMatch(/^NTR Kishi: hentai OVA\. Episodio 2: estreno 26 nov 2026\./);
  expect(animeDetailSeo('Example', { ...anime, format: 'OVA' }, '', 'es').title).not.toContain('hentai');
});
it('keeps the hentai label on long adult titles without a scheduled episode', () => {
  const { anime } = animeSeoRegressionExamples[0];
  const seo = animeDetailSeo('Seishidouin no Oshigoto The Animation', { ...anime, format: 'OVA', isAdult: true, nextAiringEpisode: null } as never, '', 'es');
  expect(seo.title).toBe('Seishidouin no Oshigoto The Animation hentai OVA – dónde verlo');
});
