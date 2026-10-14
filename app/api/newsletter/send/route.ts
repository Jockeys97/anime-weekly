import { getDictionary } from '@/lib/i18n';
import { newsletterAuthorized } from '@/lib/newsletter-server';
import { sendWeeklyNewsletter } from '@/lib/newsletter-send';

export const maxDuration = 300;

export async function POST(request: Request) {
  const d = getDictionary('it');
  const headers = { 'Cache-Control': 'no-store' };
  if (!newsletterAuthorized(request)) return Response.json({ error: d.api.unauthorized }, { status: 401, headers });
  try {
    const result = await sendWeeklyNewsletter(new URL(request.url).origin);
    return Response.json(result, { status: 'failed' in result && result.failed ? 502 : 200, headers });
  } catch { return Response.json({ error: d.newsletter.error }, { status: 503, headers }); }
}

// Supports a future Vercel cron without scheduling it yet.
export const GET = POST;
