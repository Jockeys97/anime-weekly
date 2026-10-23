import 'server-only';
import { siteUrl } from '@/lib/seo';

// Use an explicitly configured app origin on self-hosted servers. Never send a
// cron credential to the old Vercel deployment after moving the canonical DNS.
// Preview deployments continue to read their own catalog and caches.
export function internalOrigin(requestUrl?: string): URL {
  const env = process.env;
  const vercelHost = env.VERCEL_ENV === 'preview' ? env.VERCEL_URL
    : env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
  const configured = vercelHost ? `https://${vercelHost}` : env.APP_URL?.trim() || requestUrl || siteUrl().href;
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid app origin');
  return new URL(url.origin);
}

// Local development/builds can read the filesystem cache without a running
// HTTP server. Self-hosted runtime reads use the explicitly configured APP_URL.
export function sharedCacheOrigin(): URL | undefined {
  return process.env.APP_URL?.trim() || (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    ? internalOrigin() : undefined;
}
