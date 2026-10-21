import { authorizedCron } from '@/lib/cron-auth';
import { refreshAniListSnapshot, snapshotHealth, warnSnapshotStale } from '@/lib/anilist-snapshot';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const headers = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  if (!authorizedCron(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  const result = await refreshAniListSnapshot(new Date());
  const health = await snapshotHealth(new Date());
  warnSnapshotStale(health);
  return Response.json({ ...result, health }, {
    status: result.ok ? 200 : result.written > 0 ? 207 : 502, headers,
  });
}
