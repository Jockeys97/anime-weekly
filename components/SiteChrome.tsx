'use client';
import Link from '@/components/LocaleLink';
import { HeaderNavigation } from '@/components/HeaderNavigation';
import { HeaderSearchBox } from '@/components/HeaderSearchBox';
import { LanguageLinks, LanguageSelector, useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { supportUrl } from '@/lib/support';
export function SiteHeader({ myAnimeEnabled = false }: { myAnimeEnabled?: boolean }) {
  const locale = useLocale(); const d = getDictionary(locale);
  return <header className="site-header"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">a<span>↗</span></span>{d.brand}<span className="brand-period">.</span></Link><div className="header-tools"><HeaderNavigation locale={locale} myAnimeEnabled={myAnimeEnabled} /><HeaderSearchBox locale={locale} /><LanguageSelector /></div></header>;
}
export function SiteFooter() {
  const d = getDictionary(useLocale());
  const kofi = supportUrl();
  return <footer className="site-footer"><NewsletterSignup />{kofi && <section className="site-support" aria-labelledby="support-title"><h2 id="support-title">{d.support.title}</h2><p>{d.support.description}</p><a href={kofi} target="_blank" rel="noopener noreferrer">{d.support.link} ↗</a></section>}<div className="footer-top"><div><Link className="footer-brand" href="/">{d.brand}<span>.</span></Link><p>{d.footer.tagline}</p></div><a href="https://www.themoviedb.org" className="tmdb-badge" target="_blank" rel="noopener noreferrer">{d.footer.tmdbBadge}</a></div><nav className="catalog-filters"><Link href="/this-week">{d.landings.weekNav}</Link><Link href="/best-this-season">{d.landings.bestNav}</Link></nav><LanguageLinks /><div className="credits"><p>Dub data © <a href="https://mydublist.com" target="_blank" rel="noopener noreferrer">MyDubList</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>{kofi && <p><a href={kofi} target="_blank" rel="noopener noreferrer">{d.support.title} ↗</a></p>}<p className="startupbase-badge"><a href="https://startupbase.io/products/weekly-anime?utm_source=startupbase&utm_medium=badge&utm_campaign=launch-badge-dark" target="_blank" rel="noopener noreferrer"><img // eslint-disable-line @next/next/no-img-element
      src="https://statics.startupbase.io/site/badges/launched-on-sb-dark.svg" alt="Launched on StartupBase" width={250} height={55} loading="lazy" style={{ height: 55, width: 250, maxWidth: "100%", objectFit: "contain" }} /></a></p><p>{d.footer.tmdb}</p><p><a href="https://www.justwatch.com">{d.footer.justwatch}</a><span> · </span><a href="https://data.imdb.com/non-commercial-datasets/">{d.footer.omdb}</a></p><p><a href="https://anilist.co">{d.footer.anilist}</a><span> · </span><a href="https://tenrai.org">{d.footer.mal}</a></p><p><Link prefetch={false} href="/piattaforma">{d.seo.platformsTitle}</Link></p><p>Information courtesy of <a href="https://www.imdb.com">IMDb</a> (https://www.imdb.com). Used with permission.</p><p>{d.footer.note}</p></div></footer>;
}
