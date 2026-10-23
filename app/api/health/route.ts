export const dynamic = 'force-dynamic';

// Process health only: no database, vendor API, cache warmup or Blob reads.
export function GET() {
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
