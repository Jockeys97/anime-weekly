import type { Metadata } from 'next';
import { siteUrl } from '@/lib/seo';
import { Suspense } from 'react';
import { getDictionary } from '@/lib/i18n';
import { StreamingCountryProvider } from '@/components/StreamingCountry';
import { LocaleProvider } from '@/components/LanguageSelector';
import { VisitorTimeProvider } from '@/components/VisitorTime';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { myAnimeConfig } from '@/lib/my-anime-config';
import './globals.css';
import './header-navigation.css';
const d = getDictionary('it');
// Locales currently use a cookie/client preference, not distinct crawlable URLs.
// Do not advertise hreflang alternates that all resolve to the same document.
export const metadata: Metadata = {
  metadataBase: siteUrl(), title: { default: d.metadata.title, template: '%s · Anime Weekly' },
  description: d.metadata.description, icons: { icon: '/icon.svg' },
  openGraph: { title: d.metadata.title, description: d.metadata.description, siteName: 'Anime Weekly', locale: 'it_IT', type: 'website', url: '/' },
  twitter: { card: 'summary', title: d.metadata.title, description: d.metadata.description },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body><LocaleProvider><VisitorTimeProvider><div className="site-shell"><SiteHeader myAnimeEnabled={myAnimeConfig().enabled} /><StreamingCountryProvider><Suspense fallback={<main className="empty-state" role="status">{d.loading}</main>}>{children}</Suspense></StreamingCountryProvider><SiteFooter /></div></VisitorTimeProvider></LocaleProvider></body></html>;
}
