import { describe, expect, it } from 'vitest';
import { animeDetailSeo } from '../lib/anime-seo';
import { animeAlternateNames } from '../lib/anime-titles';
import { locales } from '../lib/locales';
import { SITE_TITLE_SUFFIX } from '../lib/seo';
import { animeStructuredData } from '../lib/structured-data';
import { animeSeoExamples } from './fixtures/anime-detail-seo';

const watchCopy = {
  it: ['dove vederlo', 'IMDb 7.2 e dove vederlo'],
  en: ['Where to Watch', 'IMDb 7.2 & Where to Watch'],
  es: ['dónde verlo', 'IMDb 7.2 y dónde verlo'],
  fr: ['où le regarder', 'IMDb 7.2 et où le regarder'],
  de: ['wo streamen', 'IMDb 7.2 und wo streamen'],
  pt: ['onde assistir', 'IMDb 7.2 e onde assistir'],
};

describe.each(locales)('anime detail SEO (%s)', locale => {
  const { anime } = animeSeoExamples[0];

  it('keeps the localized watch suffix with and without a cached IMDb score', () => {
    for (const [ratings, watch] of [[{}, watchCopy[locale][0]], [{ imdbRating: '7.2' }, watchCopy[locale][1]]] as const) {
      const seo = animeDetailSeo('Example', anime, '', locale, ratings);
      expect(seo.title).toContain(` – ${watch}`);
      expect(seo.description).toContain(` – ${watch}.`);
      expect((seo.title + SITE_TITLE_SUFFIX).length).toBeLessThanOrEqual(65);
      if (!('imdbRating' in ratings)) expect(seo.title).not.toContain('IMDb');
    }
  });

  it('truncates only the anime name and keeps both budgets even for very long names', () => {
    const seo = animeDetailSeo('An exceptionally long published anime title '.repeat(12), anime, 'Synopsis. '.repeat(40), locale, { imdbRating: '7.2' });
    expect(seo.title).toMatch(/… – /);
    expect(seo.title.endsWith(watchCopy[locale][1])).toBe(true);
    expect(seo.description).toContain(`${watchCopy[locale][1]}.`);
    expect((seo.title + SITE_TITLE_SUFFIX).length).toBeLessThanOrEqual(65);
    expect(seo.description.length).toBeLessThanOrEqual(160);
  });

  it.each(animeSeoExamples)('bounds fixture $anime.id and includes complete aliases where they fit', ({ anime, names, ratings }) => {
    const name = names[locale];
    const seo = animeDetailSeo(name, anime, '', locale, ratings);
    const alternateName = animeAlternateNames(name, anime.title);
    expect((seo.title + SITE_TITLE_SUFFIX).length).toBeLessThanOrEqual(65);
    expect(seo.description.length).toBeLessThanOrEqual(160);
    alternateName.forEach(alias => expect(seo.description).toContain(alias));
    expect(animeStructuredData(anime, name, seo.description, locale).alternateName).toEqual(alternateName);
  });
});

it.each([undefined, '', ' ', 'N/A', 'NaN', 'Infinity', '0', '-1', '10.1'])('does not invent an IMDb score from invalid data (%s)', imdbRating => {
  const { anime } = animeSeoExamples[0];
  const seo = animeDetailSeo('Example', { ...anime, title: { english: 'Example', romaji: null, native: null }, averageScore: 99 }, '', 'en', { imdbRating, malScore: 9.5 });
  expect(seo.title).toBe('Example – Where to Watch');
  expect(seo.description).toContain('Example – Where to Watch.');
  expect(seo.description).not.toMatch(/IMDb \d/);
});

it('deduplicates the main name and English, romaji and native aliases in both metadata fields', () => {
  const anime = { ...animeSeoExamples[0].anime, title: { english: ' Local   Name ', romaji: 'local name', native: 'Ｌｏｃａｌ Ｎａｍｅ' } };
  expect(animeAlternateNames('Local Name', anime.title)).toEqual([]);
  const seo = animeDetailSeo('Local Name', anime, '', 'en', { imdbRating: '7.2' });
  expect(seo.title).toBe('Local Name – IMDb 7.2 & Where to Watch');
  expect(seo.description.match(/Local Name/g)).toHaveLength(1);
  expect(animeStructuredData(anime, 'Local Name', seo.description)).not.toHaveProperty('alternateName');
});

it('retains English, romaji and Japanese when the main name is translated', () => {
  const { anime } = animeSeoExamples[1];
  expect(animeAlternateNames('Tu nombre', anime.title)).toEqual(['Your Name', 'Kimi no Na wa.', '君の名は。']);
  const short = { ...anime, title: { english: 'A', romaji: 'Ai', native: '愛' } };
  const seo = animeDetailSeo('A', short, '', 'en', { imdbRating: '7.2' });
  expect(seo.title).toBe('A (Ai / 愛) – IMDb 7.2 & Where to Watch');
  expect(seo.description).toContain('A (Ai / 愛)');
});

it('ignores absent aliases, preserves valid 10/10 scores, synopsis and real upcoming episode context', () => {
  const anime = { ...animeSeoExamples[0].anime, title: { english: 'Example', romaji: null, native: ' ' }, nextAiringEpisode: { episode: 3, airingAt: Date.parse('2026-10-25T12:00:00Z') / 1000 } };
  expect(animeAlternateNames('Example', anime.title)).toEqual([]);
  const seo = animeDetailSeo('Example', anime, 'A short synopsis.', 'en', { imdbRating: '10' });
  expect(seo.title).toBe('Example – IMDb 10.0 & Where to Watch');
  expect(seo.description).toContain('Next episode 3');
  expect(seo.description).toContain('A short synopsis.');
});
