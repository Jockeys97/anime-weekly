// Standalone Node 20 job: no dependencies, server startup or Vercel headers.
try {
  const appUrl = process.env.APP_URL?.trim();
  const secret = process.env.CRON_SECRET;
  if (!appUrl || !secret?.trim()) throw new Error('APP_URL and CRON_SECRET are required');
  const origin = new URL(appUrl);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid APP_URL');
  const response = await fetch(new URL('/api/revalidate', origin), {
    method: 'GET', headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) throw new Error(`Revalidation failed (HTTP ${response.status})`);
  const result = await response.json();
  if (result.revalidated !== true) throw new Error('Invalid revalidation response');
  console.info('[cron] Revalidation completed');
} catch {
  // Never print a URL, response body or upstream exception containing secrets.
  console.error('[cron] Revalidation failed; check APP_URL, CRON_SECRET and server logs');
  process.exitCode = 1;
}
