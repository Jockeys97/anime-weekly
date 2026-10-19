import 'server-only';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/locales';
export type LocaleParams = Promise<{ locale?: string }>;

// Static route params, never headers/cookies: one stable document per URL.
export async function getRequestLocale(params?: LocaleParams) {
  const locale = (await params)?.locale ?? 'it';
  if (!isLocale(locale)) notFound();
  return locale;
}
