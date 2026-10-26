'use client';

import { usePathname } from 'next/navigation';
import { SearchBox } from '@/components/SearchBox';
import type { Locale } from '@/lib/i18n';

// The Search page already has its own title field, so the header one is hidden there only.
export function HeaderSearchBox({ locale }: { locale: Locale }) {
  const pathname = usePathname() || '';
  if (/(^|\/)search\/?$/.test(pathname)) return null;
  return <SearchBox locale={locale} />;
}
