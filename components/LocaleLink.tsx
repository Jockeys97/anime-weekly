'use client';
import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { useLocale } from '@/components/LanguageSelector';
import { localePath } from '@/lib/locale-routing';
export default function LocaleLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const localized = typeof href === 'string' ? localePath(href, locale)
    : { ...href, ...(href.pathname ? { pathname: localePath(href.pathname, locale) } : {}) };
  return <NextLink {...props} href={localized} />;
}
