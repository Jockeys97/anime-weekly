import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { internalOrigin, sharedCacheOrigin } from '@/lib/internal-origin';
import { siteUrl } from '@/lib/seo';
beforeEach(() => {
  for (const name of ['APP_URL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'NEXT_PUBLIC_SITE_URL']) vi.stubEnv(name, '');
});
afterEach(() => vi.unstubAllEnvs());
it('uses APP_URL for server calls while retaining a separate canonical URL', () => {
  vi.stubEnv('APP_URL', 'https://app.up.railway.app/path');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com');
  expect(internalOrigin('http://0.0.0.0:3000/api/revalidate').href).toBe('https://app.up.railway.app/');
  expect(sharedCacheOrigin()?.href).toBe('https://app.up.railway.app/');
  expect(siteUrl().href).toBe('https://weeklyanime.com/');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  expect(siteUrl().href).toBe('https://app.up.railway.app/');
});
it('falls back to the request or site without requiring a local HTTP server for cache reads', () => {
  expect(sharedCacheOrigin()).toBeUndefined();
  expect(internalOrigin('http://localhost:3000/api/revalidate').href).toBe('http://localhost:3000/');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com');
  expect(internalOrigin().href).toBe('https://weeklyanime.com/');
});
it('retains the Vercel production collector origin', () => {
  vi.stubEnv('APP_URL', 'https://other.example');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'production.vercel.app');
  expect(sharedCacheOrigin()?.href).toBe('https://production.vercel.app/');
});
it.each(['file:///tmp/cache', 'https://user:password@example.test'])('rejects an unsafe origin %s', origin => {
  vi.stubEnv('APP_URL', origin);
  expect(() => internalOrigin()).toThrow('Invalid app origin');
});
