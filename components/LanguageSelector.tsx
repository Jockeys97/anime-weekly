'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { localePath } from '@/lib/locale-routing';
import { saveLanguage } from '@/lib/language-client';
import { getDictionary } from '@/lib/i18n';
import { isLocale, localeNames, locales, type Locale } from '@/lib/locales';
const LocaleContext = createContext<Locale>('it');
export function LocaleProvider({ locale = 'it', children }: { locale?: Locale; children: ReactNode }) {
  // The URL wins over cookies and navigator language, including after hydration.
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export const useLocale = () => useContext(LocaleContext);
export function LanguageSelector({ locale: fallback }: { locale?: Locale }) {
  const selected = useLocale();
  const locale = fallback ?? selected;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const d = getDictionary(locale);
  return <div className="language-control"><label className="sr-only" htmlFor="site-language">{d.language.label}</label><select id="site-language" value={locale} disabled={busy} aria-busy={busy} onChange={async event => {
    const value = event.target.value;
    if (!isLocale(value)) return;
    setFailed(false); setBusy(true);
    try {
      await saveLanguage(value);
      router.push(localePath(window.location.pathname + window.location.search + window.location.hash, value));
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }}>{locales.map(value => <option key={value} value={value} lang={value}>{localeNames[value]}</option>)}</select>{failed && <span role="alert">{d.language.error}</span>}</div>;
}

export function LanguageLinks() {
  const locale = useLocale();
  const pathname = usePathname();
  const d = getDictionary(locale);
  return <nav className="catalog-filters" aria-label={d.language.languages}>
    {locales.map(value => <a key={value} href={localePath(pathname, value)} hrefLang={value} lang={value} aria-current={value === locale ? 'page' : undefined} onClick={async event => {
      // Keep modified clicks and native links usable, including without JavaScript.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        void saveLanguage(value).catch(() => {});
        return;
      }
      event.preventDefault();
      const href = event.currentTarget.href;
      try { await saveLanguage(value); }
      catch { /* The locale URL still works if saving the preference fails. */ }
      window.location.assign(href);
    }}>{localeNames[value]}</a>)}
  </nav>;
}
