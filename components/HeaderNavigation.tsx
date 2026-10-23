'use client';

import Link from '@/components/LocaleLink';
import { discoveryInternalPath, landingRoute, stripLocale } from '@/lib/locale-routing';
import { usePathname } from 'next/navigation';
import { getDictionary, type Locale } from '@/lib/i18n';

export function HeaderNavigation({ locale, myAnimeEnabled = false }: { locale: Locale; myAnimeEnabled?: boolean }) {
  const publicPath = stripLocale(usePathname());
  // Rewrites expose internal slugs during SSR and translated slugs in the
  // browser. Compare the same route in both renders so hydration cannot leave
  // an old aria-current attribute behind after client navigation.
  const landing = landingRoute(publicPath);
  const pathname = discoveryInternalPath(publicPath) ?? (landing ? `/${landing}` : publicPath);
  const d = getDictionary(locale).catalog;
  const landingLabels = getDictionary(locale).landings;
  const items = [
    { href: '/', label: d.weekly, active: pathname === '/' || pathname.startsWith('/week/'), icon: 'week' },
    { href: '/season', label: d.seasons, active: pathname.startsWith('/season') || pathname.startsWith('/anime/'), icon: 'season' },
    { href: '/best-this-season', label: landingLabels.bestNav, active: pathname === '/best-this-season' || pathname.startsWith('/best-this-season/'), icon: 'season' },
    { href: '/search', label: d.search, active: pathname.startsWith('/search'), icon: 'search' },
    ...(myAnimeEnabled ? [{ href: '/my-anime', label: getDictionary(locale).myAnime.title, active: pathname.startsWith('/my-anime'), icon: 'personal' }] : []),
    { href: '/tier-list', label: getDictionary(locale).tierList.nav, active: pathname.startsWith('/tier-list'), icon: 'tier' },
  ];

  return <nav className="header-nav" aria-label={d.navLabel} lang={locale}>
    {items.map(item => <Link key={item.href} href={item.href} prefetch={false} aria-current={item.active ? 'page' : undefined}>
      <span className="header-nav-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {item.icon === 'week' ? <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M8 15h2M14 15h2" /></>
            : item.icon === 'season' ? <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>
              : item.icon === 'personal' ? <><path d="M6 3h12v18l-6-4-6 4Z" /></>
                : item.icon === 'tier' ? <><rect x="3" y="4" width="18" height="4" rx="1.5" /><rect x="3" y="10" width="13" height="4" rx="1.5" /><rect x="3" y="16" width="8" height="4" rx="1.5" /></>
                : <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
        </svg>
      </span>
      <span>{item.label}</span>
    </Link>)}
  </nav>;
}
