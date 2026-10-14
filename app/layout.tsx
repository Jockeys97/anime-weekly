import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getDictionary } from '@/lib/i18n';
import { StreamingCountryProvider } from '@/components/StreamingCountry';
import { LocaleProvider } from '@/components/LanguageSelector';
import { VisitorTimeProvider } from '@/components/VisitorTime';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import './globals.css';
import './header-navigation.css';
const d = getDictionary('it');
export const metadata: Metadata = { title: d.metadata.title, description: d.metadata.description, icons: { icon: '/icon.svg' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body><LocaleProvider><VisitorTimeProvider><div className="site-shell"><SiteHeader /><StreamingCountryProvider><Suspense fallback={<main className="empty-state" role="status">{d.loading}</main>}>{children}</Suspense></StreamingCountryProvider><SiteFooter /></div></VisitorTimeProvider></LocaleProvider></body></html>;
}
