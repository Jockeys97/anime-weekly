import { cookies } from 'next/headers';
import { oauthCallback } from '@/lib/my-anime-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return oauthCallback(request, 'trakt', await cookies());
}
