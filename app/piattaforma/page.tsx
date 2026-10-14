import Link from 'next/link';
import { PLATFORM_COUNTRIES, PLATFORM_PROVIDERS } from '@/lib/platforms';
import { pageMetadata } from '@/lib/seo';
export const metadata = pageMetadata('Anime per piattaforma e paese', 'Scopri gli anime disponibili su Netflix, Crunchyroll, Prime Video, Disney+, Apple TV+ e Max in Italia e nel mondo.', '/piattaforma');
export default function PlatformsPage() {
  return <main className="catalog-page" lang="it"><h1>Anime per piattaforma e paese</h1><p className="catalog-intro">Scegli dove guardare e il paese del catalogo streaming.</p>
    {Object.entries(PLATFORM_PROVIDERS).map(([slug, provider]) => <section key={slug}><h2>{provider.name}</h2><ul>{Object.entries(PLATFORM_COUNTRIES).map(([country, entry]) => <li key={country}><Link prefetch={false} href={`/piattaforma/${slug}/${country}`}>Anime su {provider.name} {entry.name}</Link></li>)}</ul></section>)}
  </main>;
}
