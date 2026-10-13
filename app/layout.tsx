import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { HeaderNavigation } from '@/components/HeaderNavigation';
import { SearchBox } from '@/components/SearchBox';
import { getDictionary } from '@/lib/i18n';
import { StreamingCountryProvider } from '@/components/StreamingCountry';
import { getRequestLocale } from '@/lib/request-locale';
import { LanguageSelector, LocaleProvider } from '@/components/LanguageSelector';
import './globals.css';
import './header-navigation.css';
export async function generateMetadata(): Promise<Metadata> {
  const d = getDictionary(await getRequestLocale());
  return { title: d.metadata.title, description: d.metadata.description };
}
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const d = getDictionary(locale);
  return <html lang={locale}><body><LocaleProvider locale={locale}><div className="site-shell"><header className="site-header"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">a<span>↗</span></span>{d.brand}<span className="brand-period">.</span></Link><div className="header-tools"><HeaderNavigation locale={locale} /><SearchBox locale={locale} /><LanguageSelector locale={locale} /></div></header><StreamingCountryProvider><Suspense key={locale} fallback={<main className="empty-state" role="status">{d.loading}</main>}>{children}</Suspense></StreamingCountryProvider><footer className="site-footer"><div className="footer-top"><div><Link className="footer-brand" href="/">{d.brand}<span>.</span></Link><p>{d.footer.tagline}</p></div><a href="https://www.themoviedb.org" className="tmdb-badge" target="_blank" rel="noopener noreferrer">{d.footer.tmdbBadge}</a></div><div className="credits"><p>{d.footer.tmdb}</p><p><a href="https://www.justwatch.com">{d.footer.justwatch}</a><span> · </span><a href="https://www.omdbapi.com">{d.footer.omdb}</a></p><p><a href="https://anilist.co">{d.footer.anilist}</a><span> · </span><a href="https://myanimelist.net">MyAnimeList</a><span> · </span><a href="https://jikan.moe">{d.footer.mal}</a></p><p>{d.footer.note}</p></div></footer></div></LocaleProvider></body></html>;
}
