'use client';

import Link from '@/components/LocaleLink';
import { stripLocale } from '@/lib/locale-routing';
import { usePathname } from 'next/navigation';
import { getDictionary, type Locale } from '@/lib/i18n';

export function HeaderNavigation({ locale, myAnimeEnabled = false }: { locale: Locale; myAnimeEnabled?: boolean }) {
  const pathname = stripLocale(usePathname());
  const d = getDictionary(locale).catalog;
  const landing = getDictionary(locale).landings;
  const items = [
    { href: '/', label: d.weekly, active: pathname === '/' || pathname.startsWith('/week/'), icon: 'week' },
    { href: '/season', label: d.seasons, active: pathname.startsWith('/season') || pathname.startsWith('/anime/'), icon: 'season' },
    { href: '/best-this-season', label: landing.bestNav, active: pathname === '/best-this-season', icon: 'season' },
    { href: '/search', label: d.search, active: pathname.startsWith('/search'), icon: 'search' },
    ...(myAnimeEnabled ? [{ href: '/my-anime', label: getDictionary(locale).myAnime.title, active: pathname.startsWith('/my-anime'), icon: 'personal' }] : []),
  ];

  return <nav className="header-nav" aria-label={d.navLabel} lang={locale}>
    {items.map(item => <Link key={item.href} href={item.href} prefetch={false} aria-current={item.active ? 'page' : undefined}>
      <span className="header-nav-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {item.icon === 'week' ? <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M8 15h2M14 15h2" /></>
            : item.icon === 'season' ? <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>
              : item.icon === 'personal' ? <><path d="M6 3h12v18l-6-4-6 4Z" /></>
                : <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
        </svg>
      </span>
      <span>{item.label}</span>
    </Link>)}
  </nav>;
}
