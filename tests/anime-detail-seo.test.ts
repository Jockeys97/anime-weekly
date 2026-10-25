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
