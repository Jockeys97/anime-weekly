import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readSharedSimilarCatalog, SIMILAR_CATALOG_TAG } from '@/lib/similar-catalog-client';
import { CACHE_TAG } from '@/lib/config';

beforeEach(() => { vi.stubEnv('CRON_SECRET', 'test-secret'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('reads both catalogs through the writer API using explicit tagged fetch caching', async () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test');
  vi.stubEnv('VERCEL_ENV', 'production');
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ media: [{ id: 1 }] }));
  vi.stubGlobal('fetch', fetcher);
  expect(await readSharedSimilarCatalog('full')).toEqual([{ id: 1 }]);
  await readSharedSimilarCatalog('seasonal');
  expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
    'https://example.test/api/similar-catalog?catalog=full',
    'https://example.test/api/similar-catalog?catalog=seasonal',
  ]);
  expect(fetcher).toHaveBeenCalledWith(expect.any(URL), {
    headers: { Authorization: 'Bearer test-secret' },
    cache: 'force-cache', next: { revalidate: 86400, tags: [CACHE_TAG, SIMILAR_CATALOG_TAG] },
  });
});

it.each([undefined, '', '   '])('rejects a missing or blank secret (%s) before fetching', async secret => {
  vi.stubEnv('CRON_SECRET', secret);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(readSharedSimilarCatalog('full')).rejects.toThrow('CRON_SECRET is required');
  await expect(readSharedSimilarCatalog('seasonal')).rejects.toThrow('CRON_SECRET is required');
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps preview catalog reads on the preview deployment', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', 'preview.example.test');
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ media: [] }));
  vi.stubGlobal('fetch', fetcher);
  await readSharedSimilarCatalog('full');
  expect(String(fetcher.mock.calls[0][0])).toBe('https://preview.example.test/api/similar-catalog?catalog=full');
});

it('rejects failed and malformed reads instead of ranking an error payload', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ error: 'bad data' }));
  vi.stubGlobal('fetch', fetcher);
  await expect(readSharedSimilarCatalog('full')).rejects.toThrow('(503)');
  await expect(readSharedSimilarCatalog('full')).rejects.toThrow('Invalid shared similar catalog');
});
