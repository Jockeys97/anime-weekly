import { cookies } from 'next/headers';
import { oauthRefresh } from '@/lib/my-anime-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return oauthRefresh(request, 'trakt', await cookies());
}
