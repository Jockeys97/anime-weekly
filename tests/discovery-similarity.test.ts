import { describe, expect, it } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
import { buildSimilarTagIdf, rankSimilar } from '@/lib/discovery-similarity';

const anime = (id: number, overrides: Partial<AniListAnime> = {}): AniListAnime => ({
  id, idMal: null, title: { english: `Anime ${id}`, romaji: null, native: null },
  coverImage: { large: `https://example.test/${id}.jpg`, extraLarge: null, color: null },
  bannerImage: null, description: null, startDate: null, episodes: null, format: 'TV',
  status: 'FINISHED', genres: ['Action'], averageScore: 80, popularity: 20000,
  studios: null, season: null, seasonYear: null, tags: [], ...overrides,
});
const tag = (name: string, rank = 90) => ({ name, rank });
const relation = (id: number, relationType = 'SEQUEL', type = 'ANIME') => ({ relationType,
  node: { id, type, format: 'TV', title: { english: `Anime ${id}`, romaji: null, native: null }, startDate: { year: 2020 } },
});
const votes = (entries: [AniListAnime | null, number][]) => ({ nodes: entries.map(([mediaRecommendation, rating]) => ({ mediaRecommendation, rating })) });
const ids = (source: AniListAnime, pool: AniListAnime[]) => rankSimilar(source, pool).map(({ anime }) => anime.id);

describe('similar anime ranking with controlled fixtures', () => {
  it('lets strong, rated recommendations beat current-season broad genre matches', () => {
    const recommended = anime(10, { genres: ['Drama'], seasonYear: 1998 });
    const source = anime(185874, { genres: ['Action', 'Adventure', 'Fantasy'], tags: [tag('Swordplay')],
      recommendations: votes([[recommended, 100]]) });
    const seasonal = anime(20, { genres: source.genres, popularity: 900000, averageScore: 99, seasonYear: 2026 });
    const ranked = rankSimilar(source, [source, seasonal]);
    expect(ranked.map(row => row.anime.id)).toEqual([10, 20]);
    expect(ranked[0].anime.coverImage).toEqual(recommended.coverImage);
    expect(ranked[0].anime.title).toEqual(recommended.title);
  });

  it('weights recommendation ratings, deduplicates votes by maximum and handles ID-only nodes', () => {
    const pool = [anime(2), anime(3)];
    const source = anime(1, { recommendations: { nodes: [
      { rating: 1, mediaRecommendation: { id: 2 } }, { rating: 20, mediaRecommendation: { id: 3 } },
      { rating: 2, mediaRecommendation: { id: 3 } }, { rating: 999, mediaRecommendation: { id: 99 } },
    ] } });
    expect(ids(source, pool)).toEqual([3, 2]);
    const once = anime(1, { recommendations: votes([[pool[1], 20], [pool[0], 1]]) });
    expect(rankSimilar(source, pool)).toEqual(rankSimilar(once, pool));
  });

  it('ignores null, negative, zero, nonfinite and adult recommendations', () => {
    const source = anime(1, { genres: [], recommendations: votes([
      [null, 99], [anime(2), 0], [anime(3), -1], [anime(4), NaN], [anime(5), Infinity],
      [anime(6, { isAdult: true }), 99], [anime(7), 2],
    ]) });
    expect(ids(source, [])).toEqual([7]);
  });

  it('makes rank-sensitive tag overlap beat many broad genres and light quality boosts', () => {
    const source = anime(1, { genres: ['Action', 'Adventure', 'Fantasy', 'Drama'], tags: [tag('Afterlife')] });
    const pool = [
      anime(2, { genres: source.genres, popularity: 1_000_000, averageScore: 100 }),
      anime(3, { genres: [], tags: [tag('Afterlife', 20)] }),
      anime(4, { genres: [], tags: [tag('Afterlife', 90)] }),
    ];
    expect(ids(source, pool)).toEqual([4, 3, 2]);
  });

  it('rewards rare tags more than ubiquitous tags with equal rank and overlap count', () => {
    const source = anime(1, { tags: [tag('Common'), tag('Rare')] });
    const pool = [anime(2, { tags: [tag('Common')] }), anime(3, { tags: [tag('Rare')] }),
      ...Array.from({ length: 20 }, (_, i) => anime(i + 10, { tags: [tag('Common')] }))];
    const idf = buildSimilarTagIdf(pool);
    expect(idf.get('Rare')).toBeGreaterThan(idf.get('Common')!);
    expect(ids(source, pool)[0]).toBe(3);
    expect(buildSimilarTagIdf([...pool, pool[0]])).toEqual(idf);
  });

  it('ignores spoiler/adult tags in overlap and IDF on both sides', () => {
    const unsafe = [{ ...tag('Reveal'), isMediaSpoiler: true }, { ...tag('Twist'), isGeneralSpoiler: true }, { ...tag('Adult'), isAdult: true }];
    const source = anime(1, { genres: [], tags: [...unsafe, tag('Safe')] });
    const pool = [anime(2, { genres: [], tags: unsafe.map(({ name, rank }) => ({ name, rank })) }),
      anime(3, { genres: [], tags: unsafe }), anime(4, { genres: [], tags: [tag('Safe')] })];
    expect(ids(source, pool)).toEqual([4]);
    expect([...buildSimilarTagIdf([source]).keys()]).toEqual(['Safe']);
    expect(ids(anime(5, { genres: [], tags: unsafe.map(({ name, rank }) => ({ name, rank })) }), [pool[1]])).toEqual([]);
  });

  it('normalizes tag overlap so unrelated extra tags do not improve a match', () => {
    const source = anime(1, { tags: [tag('Swordplay')] });
    const precise = anime(3, { tags: [tag('Swordplay')] });
    const noisy = anime(2, { tags: [tag('Swordplay'), ...Array.from({ length: 20 }, (_, i) => tag(`Extra${i}`))] });
    expect(ids(source, [noisy, precise])).toEqual([3, 2]);
  });

  it('uses light bounded popularity/score boosts and a small obscurity penalty', () => {
    const source = anime(1);
    const pool = [anime(2, { popularity: 1, averageScore: 80 }), anime(3, { popularity: 100000, averageScore: 80 }),
      anime(4, { popularity: 100000, averageScore: 90 })];
    const ranked = rankSimilar(source, pool);
    expect(ranked.map(row => row.anime.id)).toEqual([4, 3, 2]);
    expect(ranked[0].score - ranked[2].score).toBeLessThan(1);
    expect(ids(source, [anime(5, { genres: [], averageScore: 100, popularity: 10000000 })])).toEqual([]);
    expect(Number.isFinite(rankSimilar(source, [anime(6, { averageScore: NaN, popularity: Infinity })])[0].score)).toBe(true);
  });

  it('caps direct, reverse and transitive franchise relations at two, even through an absent parent', () => {
    const source = anime(1, { relations: { edges: [relation(2), relation(99, 'PARENT')] } });
    const pool = [anime(2, { relations: { edges: [relation(3)] } }), anime(3),
      anime(4, { relations: { edges: [relation(1, 'SIDE_STORY')] } }),
      anime(5, { relations: { edges: [relation(99, 'ALTERNATIVE')] } }), anime(6)];
    expect(ids(source, pool)).toEqual([2, 3, 6]);
    // Relations alone establish eligibility even with no genre/tag overlap.
    expect(ids(anime(1, { genres: [], relations: { edges: [relation(2)] } }), [anime(2)])).toEqual([2]);
  });

  it('also caps other franchises, while character and manga links do not merge them', () => {
    const source = anime(1);
    const pool = [anime(2, { relations: { edges: [relation(3), relation(4)] } }), anime(3), anime(4),
      anime(5, { relations: { edges: [relation(6, 'CHARACTER'), relation(7, 'ADAPTATION', 'MANGA')] } }), anime(6), anime(7)];
    expect(ids(source, pool)).toEqual([2, 3, 5, 6, 7]);
  });

  it('is deterministic with duplicates, input permutations and score ties, without mutating inputs', () => {
    const source = anime(1, { tags: [tag('Shared'), tag('Shared')] });
    const pool = [anime(4, { tags: [tag('Shared')] }), anime(2, { tags: [tag('Shared')] }), anime(3)];
    const snapshot = JSON.stringify({ source, pool });
    const expected = rankSimilar(source, pool);
    expect(expected.map(row => row.anime.id)).toEqual([2, 4, 3]);
    expect(rankSimilar(source, [...pool].reverse())).toEqual(expected);
    expect(rankSimilar(source, [...pool, pool[0]])).toEqual(expected);
    expect(JSON.stringify({ source, pool })).toBe(snapshot);
  });
});
