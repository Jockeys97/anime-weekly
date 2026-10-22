import { snapshotHealth, warnSnapshotStale } from '@/lib/anilist-snapshot';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await snapshotHealth(new Date());
  warnSnapshotStale(health);
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
