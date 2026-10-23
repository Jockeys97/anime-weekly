import type { Metadata } from 'next';
import type { Locale } from '@/lib/locales';
import { languageAlternates, localePath, openGraphLocales } from '@/lib/locale-routing';
import { formatWeek, isoWeek } from '@/lib/week';

export const SITE_TITLE_SUFFIX = ' · Weekly Anime';

export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim() || env.APP_URL?.trim() || (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' ? 'https://weeklyanime.com' : 'http://localhost:3000');
  const url = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`);
  return new URL(url.origin);
}

// A page-level openGraph object replaces the inherited one, file-based image
// included. Pages without their own image share the localized weekly card.
export function defaultShareImage(locale: Locale = 'it', date = new Date()): string {
  return new URL(localePath(`/week/${formatWeek(isoWeek(date))}/opengraph-image`, locale), siteUrl()).href;
}

export function pageMetadata(title: string, description: string, path: string, image?: string | null, locale: Locale = 'it'): Metadata {
  const url = new URL(localePath(path, locale), siteUrl()).href;
  const shared = image || defaultShareImage(locale);
  return {
    title, description, alternates: { canonical: url, languages: languageAlternates(path, siteUrl()) },
    openGraph: { title, description, url, siteName: 'Weekly Anime', locale: openGraphLocales[locale], type: 'website', images: [{ url: shared, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [shared] },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
