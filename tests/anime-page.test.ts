import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/request-locale', () => ({ getRequestLocale: async () => 'it' }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), animeName: () => 'Example anime', animeDescription: () => 'Example synopsis' }));
vi.mock('../lib/anime-ratings', () => ({ getAnimeRatingsById: vi.fn() }));
vi.mock('../lib/tmdb', () => ({ getAnimeAvailability: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { getAnimeRatingsById } from '../lib/anime-ratings';
import { getAnimeAvailability } from '../lib/tmdb';
import { AnimeRatingTile } from '../components/RatingSummary';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimePage from '../app/anime/[id]/page';

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

function textInTree(node: unknown, text: string): boolean {
  if (node === text) return true;
  if (Array.isArray(node)) return node.some(child => textInTree(child, text));
  if (React.isValidElement<{ children?: unknown; original?: string }>(node)) return node.props.original === text || textInTree(node.props.children, text);
  return false;
}
describe('progressive anime details', () => {
  it('returns the core page while ratings and streaming are still pending', async () => {
    vi.stubGlobal('React', React);
    vi.mocked(getAnime).mockResolvedValue({ id: 21, idMal: 123, title: { english: 'Example anime', romaji: null, native: null }, coverImage: null, bannerImage: null, description: 'Example synopsis', startDate: null, episodes: 12, format: 'TV', status: 'FINISHED', genres: [], averageScore: 81, studios: null, season: null, seasonYear: null });
    vi.mocked(getAnimeRatingsById).mockReturnValue(new Promise(() => {}));
    vi.mocked(getAnimeAvailability).mockReturnValue(new Promise(() => {}));
    const page = await AnimePage({ params: Promise.resolve({ id: '21' }) });
    expect(textInTree(page, 'Example anime')).toBe(true);
    expect(textInTree(page, 'Example synopsis')).toBe(true);
    function findFallback(node: unknown): React.ReactElement | null {
      if (Array.isArray(node)) return node.map(findFallback).find(Boolean) || null;
      if (!React.isValidElement<{ children?: unknown; fallback?: React.ReactElement }>(node)) return null;
      if (node.props.fallback?.type === AnimeRatingTile) return node.props.fallback;
      return findFallback(node.props.children);
    }
    const fallback = findFallback(page);
    expect(fallback).not.toBeNull();
    const html = renderToStaticMarkup(fallback!);
    expect(html).toContain('81%');
    expect(html).toContain('https://anilist.co/anime/21/');
    expect(getAnimeRatingsById).toHaveBeenCalledTimes(1);
    expect(getAnimeAvailability).toHaveBeenCalledTimes(1);
  }, 1000);
  it('rejects invalid IDs before starting enrichment', async () => {
    await expect(AnimePage({ params: Promise.resolve({ id: 'bad' }) })).rejects.toThrow('not-found');
    expect(getAnime).not.toHaveBeenCalled();
    expect(getAnimeRatingsById).not.toHaveBeenCalled();
    expect(getAnimeAvailability).not.toHaveBeenCalled();
  });
});
