import type { Locale } from '@/lib/locales';

export async function saveLanguage(locale: Locale) {
  const response = await fetch('/api/language', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
    signal: AbortSignal.timeout(10000),
    keepalive: true,
  });
  if (!response.ok) throw new Error('Language update failed');
}
