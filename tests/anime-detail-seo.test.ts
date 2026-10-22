import { describe, expect, it } from 'vitest';
import { animeDetailSeo } from '../lib/anime-seo';
import { animeAlternateNames } from '../lib/anime-titles';
import { locales } from '../lib/locales';
import { animeStructuredData } from '../lib/structured-data';
import { animeSeoExamples, animeSeoRegressionExamples } from './fixtures/anime-detail-seo';

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
      expect(seo.title.length).toBeLessThanOrEqual(65);
      if (!('imdbRating' in ratings)) expect(seo.title).not.toContain('IMDb');
    }
  });

  it('truncates only the anime name and keeps both budgets even for very long names', () => {
    const seo = animeDetailSeo('An exceptionally long published anime title '.repeat(12), anime, 'Synopsis. '.repeat(40), locale, { imdbRating: '7.2' });
    expect(seo.title).toMatch(/… – /);
    expect(seo.title.endsWith(watchCopy[locale][1])).toBe(true);
    expect(seo.description).toContain(`${watchCopy[locale][1]}.`);
    expect(seo.title.length).toBeLessThanOrEqual(65);
    expect(seo.description.length).toBeLessThanOrEqual(160);
  });

  it.each(animeSeoExamples)('bounds fixture $anime.id and includes complete aliases where they fit', ({ anime, names, ratings }) => {
    const name = names[locale];
    const seo = animeDetailSeo(name, anime, '', locale, ratings);
    const alternateName = animeAlternateNames(name, anime.title);
    expect(seo.title.length).toBeLessThanOrEqual(65);
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

describe.each(locales)('detail SEO regressions (%s)', locale => {
  const seriesLabel = { it: 'serie', en: 'series', es: 'serie', fr: 'série', de: 'Serie', pt: 'série' }[locale];

  it.each(animeSeoRegressionExamples)('labels only PREQUEL-related ratings and bounds fixture $anime.id', ({ anime, name, ratings }) => {
    const seo = animeDetailSeo(name, anime, '', locale, ratings);
    expect(seo.title.length).toBeLessThanOrEqual(65);
    expect(seo.description.length).toBeLessThanOrEqual(160);
    expect(seo.title).not.toContain('Weekly Anime');
    if (ratings.imdbRating) {
      const rating = `IMDb ${ratings.imdbRating}` + (anime.relations?.edges.length ? ` (${seriesLabel})` : '');
      expect(seo.title).toContain(rating);
      expect(seo.description).toContain(rating);
    }
    if (anime.id === 1) {
      expect(seo.title).not.toContain(`(${seriesLabel})`);
      expect(seo.description).not.toContain(`(${seriesLabel})`);
    }
    if (anime.id === 21) {
      expect(seo.title).toContain('One Piece (ワンピース)');
      expect(seo.description).toContain('One Piece (ワンピース)');
      expect(animeStructuredData(anime, name, seo.description, locale).alternateName).toEqual(['ワンピース']);
    }
  });

  it.each(['Season 3', 'Part 2', 'Cour III', '2nd Season', 'Final Season', 'Final Season Part 2', 'Swordsmith Village Arc', 'IV', 'Season III', 'Part 2: The Calamity'])('keeps the end of long names with %s', ending => {
    const { anime, ratings } = animeSeoRegressionExamples[2];
    const name = `The Apothecary Diaries ${'A long published subtitle '.repeat(8)}${ending}`;
    const seo = animeDetailSeo(name, anime, '', locale, ratings);
    const titleName = seo.title.split(' – ')[0];
    const descriptionName = seo.description.split(' – ')[0];
    expect(titleName).toContain('… ');
    expect(titleName.endsWith(ending)).toBe(true);
    expect(descriptionName.endsWith(ending)).toBe(true);
    expect(seo.title.length).toBeLessThanOrEqual(65);
    expect(seo.description.length).toBeLessThanOrEqual(160);
  });
});

it('uses PREQUEL relations rather than a title heuristic, and requires a valid rating', () => {
  const { anime } = animeSeoRegressionExamples[2];
  for (const relationType of ['SEQUEL', 'ADAPTATION', 'SIDE_STORY']) {
    const unrelated = { ...anime, relations: { edges: anime.relations!.edges.map(edge => ({ ...edge, relationType })) } };
    expect(animeDetailSeo('Final Season', unrelated, '', 'en', { imdbRating: '8.6' }).title).not.toContain('(series)');
  }
  const unrated = animeDetailSeo('Example', anime, '', 'en', { imdbRating: 'N/A' });
  expect(unrated.title).toMatch(/ – Where to Watch$/);
  expect(unrated.title).not.toContain('IMDb');
  expect(unrated.description).not.toMatch(/IMDb \d/);
});

it.each([null, ' ', 'One Piece', 'ＯＮＥ ＰＩＥＣＥ'])('uses only the first kana synonym for an absent or duplicate native title (%s)', native => {
  const { anime } = animeSeoRegressionExamples[0];
  expect(animeAlternateNames('One Piece', { ...anime.title, native }, anime.synonyms)).toEqual(['ワンピース']);
});

it('handles native duplicates of other titles and keeps a distinct native title', () => {
  const titles = { english: 'English Name', romaji: 'Romaji Name', native: 'Romaji Name' };
  const synonyms = ['Unrelated English', '漢字', 'ひらがな', 'カタカナ'];
  expect(animeAlternateNames('Local Name', titles, synonyms)).toEqual(['English Name', 'Romaji Name', 'ひらがな']);
  expect(animeAlternateNames('Local Name', { ...titles, native: '日本語' }, synonyms)).toEqual(['English Name', 'Romaji Name', '日本語']);
  expect(animeAlternateNames('English Name', { ...titles, native: null }, ['Other English', '漢字'])).toEqual(['Romaji Name']);
  expect(animeAlternateNames('ひらがな', { english: null, romaji: null, native: null }, ['ひらがな', 'カタカナ'])).toEqual([]);
});
