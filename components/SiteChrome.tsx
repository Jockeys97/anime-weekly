'use client';
import Link from 'next/link';
import { HeaderNavigation } from '@/components/HeaderNavigation';
import { SearchBox } from '@/components/SearchBox';
import { LanguageSelector, useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
export function SiteHeader() {
  const locale = useLocale(); const d = getDictionary(locale);
  return <header className="site-header"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">a<span>↗</span></span>{d.brand}<span className="brand-period">.</span></Link><div className="header-tools"><HeaderNavigation locale={locale} /><SearchBox locale={locale} /><LanguageSelector /></div></header>;
}
export function SiteFooter() {
  const d = getDictionary(useLocale());
  return <footer className="site-footer"><div className="footer-top"><div><Link className="footer-brand" href="/">{d.brand}<span>.</span></Link><p>{d.footer.tagline}</p></div><a href="https://www.themoviedb.org" className="tmdb-badge" target="_blank" rel="noopener noreferrer">{d.footer.tmdbBadge}</a></div><div className="credits"><p>{d.footer.tmdb}</p><p><a href="https://www.justwatch.com">{d.footer.justwatch}</a><span> · </span><a href="https://www.omdbapi.com">{d.footer.omdb}</a></p><p><a href="https://anilist.co">{d.footer.anilist}</a><span> · </span><a href="https://jikan.moe">{d.footer.mal}</a></p><p>{d.footer.note}</p></div></footer>;
}
