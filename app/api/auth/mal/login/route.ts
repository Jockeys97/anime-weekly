import { oauthLogin } from '@/lib/my-anime-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return oauthLogin(request, 'mal');
}
