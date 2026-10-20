import { describe, expect, it } from 'vitest';
import { formatAnimeSeo } from '../lib/anime-seo';

const anime = { format: 'MOVIE', startDate: { year: 2026, month: 4, day: 1 }, seasonYear: 2025, averageScore: 81 };
const provider = (provider_name: string) => ({ provider_name, provider_id: 8, logo_path: null });
const availability = {
  providersUnavailable: false,
  providers: { IT: { link: '', providers: [provider('Netflix'), provider('Netflix')] }, US: { link: '', providers: [provider('Hulu')] } },
};

describe('Italian anime SEO formatter', () => {
  it('uses the real premiere year, format, score and only Italian platforms', () => {
    expect(formatAnimeSeo('Akira', anime, 'Una storia a Tokyo.', availability)).toEqual({
      title: 'Akira (2026) – Film anime: dove vederlo in streaming',
      description: 'Film anime del 2026. Voto 8,1/10. In streaming su Netflix in Italia. Una storia a Tokyo.',
    });
  });

  it.each([['TV', 'Serie TV'], ['TV_SHORT', 'Serie TV'], ['MOVIE', 'Film'], ['OVA', 'OVA'], ['ONA', 'ONA'], ['SPECIAL', 'Special']])('labels %s as %s', (format, label) => {
    expect(formatAnimeSeo('Titolo', { ...anime, format }).description).toBe(`${label} anime del 2026. Voto 8,1/10.`);
  });

  it('omits missing data and falls back to the actual season year', () => {
    expect(formatAnimeSeo('Titolo', { format: null, startDate: null, seasonYear: null, averageScore: null })).toEqual({
      title: 'Titolo – Anime: dove vederlo in streaming',
      description: 'Trama, valutazioni e dove guardare Titolo in streaming.',
    });
    expect(formatAnimeSeo('Titolo', { ...anime, startDate: null }).description).toContain('del 2025.');
  });

  it.each([null, 0, -1, NaN, Infinity, 101])('omits an absent or invalid score (%s)', averageScore => {
    expect(formatAnimeSeo('Titolo', { ...anime, averageScore }).description).not.toContain('Voto');
  });

  it('omits unavailable or foreign offers', () => {
    expect(formatAnimeSeo('Titolo', anime, '', { ...availability, providersUnavailable: true }).description).not.toContain('streaming');
    expect(formatAnimeSeo('Titolo', anime, '', { ...availability, providers: { US: availability.providers.US } }).description).not.toContain('streaming');
  });

  it('bounds long text at word boundaries while retaining year and format in the title', () => {
    const result = formatAnimeSeo('Un titolo anime molto lungo con tante parole e un sottotitolo ancora più lungo', anime, 'Una storia italiana. '.repeat(30), availability);
    expect(result.title.length).toBeLessThanOrEqual(65);
    expect(result.title).toMatch(/… \(2026\) – Film anime$/);
    expect(result.description.length).toBeLessThanOrEqual(155);
    expect(result.description).toMatch(/…$/);
    expect(result.description).toContain('In streaming su Netflix in Italia.');
  });

  it('keeps complete platform names when offers exceed the description budget', () => {
    const result = formatAnimeSeo('Titolo', anime, '', { providersUnavailable: false, providers: { IT: { link: '', providers: [provider('Netflix'), provider('Piattaforma '.repeat(30))] } } });
    expect(result.description).toBe('Film anime del 2026. Voto 8,1/10. In streaming su Netflix in Italia.');
  });
});

import { animeHeading, animeIntro, nextAnimeEpisode } from '../lib/anime-seo';
import { locales } from '../lib/locales';
const airing = { ...anime, season: 'FALL', seasonYear: 2026, nextAiringEpisode: { episode: 3, airingAt: Date.parse('2026-10-25T23:30:00Z') / 1000 } };
it('uses real next episode data for localized titles, metadata and dated intros in the specified zones', () => {
  const expected = {
    it: 'Titolo episodio 3: data di uscita e voti', en: 'Titolo episode 3: release date & ratings',
    es: 'Titolo episodio 3: fecha de estreno y valoraciones', fr: 'Titolo épisode 3: date de sortie et notes',
    de: 'Titolo Folge 3: Erscheinungsdatum und Bewertungen', pt: 'Titolo episódio 3: data de lançamento e avaliações',
  };
  for (const locale of locales) {
    expect(formatAnimeSeo('Titolo', airing, '', undefined, locale).title).toBe(expected[locale]);
    expect(animeHeading('Titolo', airing, locale)).toBe(expected[locale]);
    const intro = animeIntro(airing, { imdbRating: '8.4', malScore: 8.2 }, locale);
    expect(intro).toContain(locale === 'it' ? '26 ottobre 2026' : '25');
    expect(intro).toContain(locale === 'it' ? '(Europe/Rome)' : '(UTC)');
    for (const source of ['IMDb', 'MyAnimeList', 'AniList']) expect(intro).toContain(source);
  }
});
it('omits absent or invalid episode, season and scores without invented fallback facts', () => {
  expect(animeIntro({ averageScore: null, seasonYear: null }, {}, 'en')).toBe('');
  for (const nextAiringEpisode of [null, { episode: 0, airingAt: 100 }, { episode: 3, airingAt: NaN }, { episode: 2, airingAt: 0 }]) {
    expect(nextAnimeEpisode({ nextAiringEpisode })).toBeNull();
    expect(animeHeading('Titolo', { nextAiringEpisode }, 'it')).toBe('Titolo');
  }
  expect(animeIntro({ averageScore: 101, seasonYear: null }, { imdbRating: 'N/A', malScore: Infinity }, 'it')).toBe('');
});
