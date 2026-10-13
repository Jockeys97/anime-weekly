import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { defaultLocale, getDictionary } from '@/lib/i18n';
import './globals.css';
const d = getDictionary();
const nav = getDictionary('it').catalog;
export const metadata: Metadata = { title: d.metadata.title, description: d.metadata.description };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang={defaultLocale}><body><div className="site-shell"><header className="site-header"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">a<span>↗</span></span>{d.brand}<span className="brand-period">.</span></Link><div className="header-tools"><nav className="header-nav" aria-label={nav.navLabel} lang="it"><Link href="/" prefetch={false}>{nav.weekly}</Link><Link href="/season" prefetch={false}>{nav.seasons}</Link><Link href="/search" prefetch={false}>{nav.search}</Link></nav><SearchBox /></div></header>{children}<footer className="site-footer"><div className="footer-top"><div><Link className="footer-brand" href="/">{d.brand}<span>.</span></Link><p>{d.footer.tagline}</p></div><a href="https://www.themoviedb.org" className="tmdb-badge" target="_blank" rel="noopener noreferrer">{d.footer.tmdbBadge}</a></div><div className="credits"><p>{d.footer.tmdb}</p><p><a href="https://www.justwatch.com">{d.footer.justwatch}</a><span> · </span><a href="https://www.omdbapi.com">{d.footer.omdb}</a></p><p><a href="https://anilist.co">{d.footer.anilist}</a><span> · </span><a href="https://myanimelist.net">MyAnimeList</a><span> · </span><a href="https://jikan.moe">{d.footer.mal}</a></p><p>{d.footer.note}</p></div></footer></div></body></html>;
}
