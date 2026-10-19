import type { Metadata } from 'next';
import type { Locale } from '@/lib/locales';
import { languageAlternates, localePath, openGraphLocales } from '@/lib/locale-routing';

export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim() || (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' ? 'https://weeklyanime.com' : 'http://localhost:3000');
  const url = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`);
  return new URL(url.origin);
}

export function pageMetadata(title: string, description: string, path: string, image?: string | null, locale: Locale = 'it'): Metadata {
  const url = new URL(localePath(path, locale), siteUrl()).href;
  return {
    title, description, alternates: { canonical: url, languages: languageAlternates(path, siteUrl()) },
    openGraph: { title, description, url, siteName: 'Weekly Anime', locale: openGraphLocales[locale], type: 'website', ...(image ? { images: [{ url: image, alt: title }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
