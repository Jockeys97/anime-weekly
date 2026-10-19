import type { Metadata } from 'next';
import { siteUrl } from '@/lib/seo';
import { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { getDictionary } from '@/lib/i18n';
import { StreamingCountryProvider } from '@/components/StreamingCountry';
import { LocaleProvider } from '@/components/LanguageSelector';
import { VisitorTimeProvider } from '@/components/VisitorTime';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { myAnimeConfig } from '@/lib/my-anime-config';
import '../globals.css';
import '../header-navigation.css';
import { locales } from '@/lib/locales';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { pageMetadata } from '@/lib/seo';

// Only six lightweight roots are built. Detail/week/provider routes keep their
// empty generateStaticParams lists and are generated on demand.
export function generateStaticParams() { return locales.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale);
  return { ...pageMetadata(d.metadata.title, d.metadata.description, '/', undefined, locale),
    metadataBase: siteUrl(), title: { default: d.metadata.title, template: '%s · Weekly Anime' },
    icons: { icon: '/icon.svg' } };
}
export default async function RootLayout({ children, params }: Readonly<{ children: React.ReactNode; params: LocaleParams }>) {
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale);
  return <html lang={locale}><body><LocaleProvider key={locale} locale={locale}><VisitorTimeProvider><div className="site-shell"><SiteHeader myAnimeEnabled={myAnimeConfig().enabled} /><StreamingCountryProvider><Suspense fallback={<main className="empty-state" role="status">{d.loading}</main>}>{children}</Suspense></StreamingCountryProvider><SiteFooter /></div></VisitorTimeProvider></LocaleProvider><Analytics /></body></html>;
}
