import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/tmdb', () => ({ getLocalizedSynopsis: vi.fn() }));
vi.mock('../lib/deepl', () => ({ isDeepLConfigured: vi.fn(), translateSynopsis: vi.fn() }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), animeDescription: (value: string | null) => (value || '').replace(/<[^>]*>/g, '').trim() }));
import { getLocalizedSynopsis } from '../lib/tmdb';
import { isDeepLConfigured, translateSynopsis } from '../lib/deepl';
import { getAnime } from '../lib/anilist';
import { GET } from '../app/api/synopsis/route';
const request = (extra = '') => new Request(`https://example.com/api/synopsis?locale=it&kind=tv&title=Example&year=2025${extra}`);
beforeEach(() => {
  vi.mocked(getLocalizedSynopsis).mockResolvedValue(null);
  vi.mocked(isDeepLConfigured).mockReturnValue(true);
  vi.mocked(translateSynopsis).mockResolvedValue('Trama automatica.');
  vi.mocked(getAnime).mockResolvedValue({ id: 21, description: '<p>Canonical English synopsis.</p>' } as Awaited<ReturnType<typeof getAnime>>);
});
afterEach(() => vi.resetAllMocks());
describe('synopsis source priority', () => {
  it('uses TMDB first without consuming any DeepL quota', async () => {
    vi.mocked(getLocalizedSynopsis).mockResolvedValue('Trama TMDB.');
    expect(await (await GET(request('&anilist=21'))).json()).toEqual({ synopsis: 'Trama TMDB.', language: 'it', source: 'tmdb' });
    expect(getAnime).not.toHaveBeenCalled(); expect(translateSynopsis).not.toHaveBeenCalled();
  });
  it('only translates the canonical upstream synopsis, ignoring submitted prose', async () => {
    expect(await (await GET(request('&anilist=21&text=untrusted%20prose'))).json()).toEqual({ synopsis: 'Trama automatica.', language: 'it', source: 'deepl' });
    expect(getAnime).toHaveBeenCalledWith(21);
    expect(translateSynopsis).toHaveBeenCalledWith('Canonical English synopsis.', 'it');
  });
  it('keeps existing callers without an AniList ID usable and never guesses source text', async () => {
    expect(await (await GET(request())).json()).toEqual({ synopsis: null, language: null, source: null });
    expect(getAnime).not.toHaveBeenCalled(); expect(translateSynopsis).not.toHaveBeenCalled();
  });
  it('does not fetch source text if DeepL is not configured', async () => {
    vi.mocked(isDeepLConfigured).mockReturnValue(false);
    expect((await (await GET(request('&anilist=21'))).json()).synopsis).toBeNull();
    expect(getAnime).not.toHaveBeenCalled(); expect(translateSynopsis).not.toHaveBeenCalled();
  });
  it('preserves the English fallback on an unavailable or empty canonical description', async () => {
    vi.mocked(getAnime).mockResolvedValue(null);
    expect((await (await GET(request('&anilist=21'))).json()).synopsis).toBeNull();
    expect(translateSynopsis).not.toHaveBeenCalled();
  });
  it('reports no machine translation on a quota or network failure', async () => {
    vi.mocked(translateSynopsis).mockResolvedValue(null);
    expect(await (await GET(request('&anilist=21'))).json()).toEqual({ synopsis: null, language: null, source: null });
  });
  it.each(['0', '-1', '1.5', '2147483648', 'bad'])('rejects invalid AniList ID %s before any upstream call', async id => {
    expect((await GET(request(`&anilist=${id}`))).status).toBe(400);
    expect(getLocalizedSynopsis).not.toHaveBeenCalled(); expect(translateSynopsis).not.toHaveBeenCalled();
  });
});
