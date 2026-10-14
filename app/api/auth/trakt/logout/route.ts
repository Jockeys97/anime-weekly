import { cookies } from 'next/headers';
import { oauthLogout } from '@/lib/my-anime-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return oauthLogout(request, 'trakt', await cookies());
}
// Export a read handler only to return 404 while disabled; enabled logout is POST-only.
export function GET(request: Request) { return oauthLogout(request, 'trakt', { get: () => undefined }); }
