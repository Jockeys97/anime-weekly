import { SearchHistory } from '@/components/SearchHistory';
import type { Metadata } from 'next';
import { SITE_TITLE_SUFFIX, siteUrl } from '@/lib/seo';
import { Suspense } from 'react';
import FilteredAnalytics from '@/components/FilteredAnalytics';
import { getDictionary } from '@/lib/i18n';
import { StreamingCountryProvider } from '@/components/StreamingCountry';
import { LocaleProvider } from '@/components/LanguageSelector';
import { VisitorTimeProvider } from '@/components/VisitorTime';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { myAnimeConfig } from '@/lib/my-anime-config';
import '../globals.css';
import '../header-navigation.css';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { pageMetadata } from '@/lib/seo';

// Enumerating locale roots here also forces their homepages to be built, even
// when the child returns no static params. Keep locale pages on-demand ISR so
// a deploy cannot cache a homepage generated against an empty weekly snapshot.
export const dynamicParams = true;
export function generateStaticParams() { return []; }
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale);
  return { ...pageMetadata(d.metadata.title, d.metadata.description, '/', undefined, locale),
    metadataBase: siteUrl(), title: { default: d.metadata.title, template: `%s${SITE_TITLE_SUFFIX}` },
    icons: { icon: '/icon.svg' } };
}
export default async function RootLayout({ children, params }: Readonly<{ children: React.ReactNode; params: LocaleParams }>) {
  const locale = await getRequestLocale(params);
  const d = getDictionary(locale);
  return <html lang={locale}><body><LocaleProvider key={locale} locale={locale}><VisitorTimeProvider><SearchHistory /><div className="site-shell"><SiteHeader myAnimeEnabled={myAnimeConfig().enabled} /><StreamingCountryProvider><Suspense fallback={<main className="empty-state route-loading" role="status">{d.loading}</main>}>{children}</Suspense></StreamingCountryProvider><SiteFooter /></div></VisitorTimeProvider></LocaleProvider><FilteredAnalytics /></body></html>;
}
