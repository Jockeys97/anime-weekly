import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { negotiateLocale } from '@/lib/locales';
export const getRequestLocale = cache(async () => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(requestHeaders.get('accept-language'), cookieStore.get('anime-language')?.value);
});
