import type { Metadata } from 'next';
import Link from 'next/link';
import { defaultLocale, getDictionary } from '@/lib/i18n';
import { StreamingCountryProvider } from '@/components/StreamingCountry';
import './globals.css';
const d = getDictionary();
export const metadata: Metadata = { title: d.metadata.title, description: d.metadata.description };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang={defaultLocale}><body><div className="site-shell"><header className="site-header"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">a<span>↗</span></span>{d.brand}<span className="brand-period">.</span></Link><Link href="/" className="header-link">{d.nav.guide}<span aria-hidden="true">↗</span></Link></header><StreamingCountryProvider>{children}</StreamingCountryProvider><footer className="site-footer"><div className="footer-top"><div><Link className="footer-brand" href="/">{d.brand}<span>.</span></Link><p>{d.footer.tagline}</p></div><a href="https://www.themoviedb.org" className="tmdb-badge" target="_blank" rel="noopener noreferrer">{d.footer.tmdbBadge}</a></div><div className="credits"><p>{d.footer.tmdb}</p><p><a href="https://www.justwatch.com">{d.footer.justwatch}</a><span> · </span><a href="https://www.omdbapi.com">{d.footer.omdb}</a></p><p><a href="https://anilist.co">{d.footer.anilist}</a><span> · </span><a href="https://myanimelist.net">MyAnimeList</a><span> · </span><a href="https://jikan.moe">{d.footer.mal}</a></p><p>{d.footer.note}</p></div></footer></div></body></html>;
}
