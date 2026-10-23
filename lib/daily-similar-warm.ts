import 'server-only';

// Start alongside the weekly collectors so neither task consumes the other's
// 300-second budget. This is an awaited step of the one daily scheduled job.
export async function warmDailySimilarCatalog(request: Request): Promise<boolean> {
  try {
    const response = await fetch(new URL('/api/similar-catalog', request.url), {
      headers: { authorization: request.headers.get('authorization') || '' },
      cache: 'no-store', signal: AbortSignal.timeout(270000),
    });
    if (!response.ok) throw new Error(`Catalog warm failed (${response.status})`);
    return true;
  } catch (error) {
    console.error('[daily-cron] similar catalog unavailable', error);
    return false;
  }
}
