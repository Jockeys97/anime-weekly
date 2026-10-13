'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { getDictionary } from '@/lib/i18n';
import { isLocale, localeNames, locales, type Locale } from '@/lib/locales';
const LocaleContext = createContext<Locale>('en');
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) { return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>; }
export const useLocale = () => useContext(LocaleContext);
export function LanguageSelector({ locale }: { locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [selectedLocale, selectLocale] = useState(locale);
  const [failed, setFailed] = useState(false);
  const d = getDictionary(locale);
  return <div className="language-control"><label className="sr-only" htmlFor="site-language">{d.language.label}</label><select id="site-language" value={selectedLocale} disabled={busy} aria-busy={busy} onChange={async event => {
    const value = event.target.value;
    if (!isLocale(value)) return;
    setFailed(false); setBusy(true); selectLocale(value);
    try {
      const response = await fetch('/api/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: value }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Language update failed');
      // A fresh document applies the cookie to every server component and
      // streamed section together, avoiding a mix with the previous locale.
      window.location.reload();
    } catch { setFailed(true); setBusy(false); selectLocale(locale); }
  }}>{locales.map(value => <option key={value} value={value} lang={value}>{localeNames[value]}</option>)}</select>{failed && <span role="alert">{d.language.error}</span>}</div>;
}
