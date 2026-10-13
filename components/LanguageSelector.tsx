'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getDictionary } from '@/lib/i18n';
import { isLocale, localeNames, locales, type Locale } from '@/lib/locales';
const LocaleContext = createContext<Locale>('en');
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) { return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>; }
export const useLocale = () => useContext(LocaleContext);
export function LanguageSelector({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const d = getDictionary(locale);
  return <div className="language-control"><label className="sr-only" htmlFor="site-language">{d.language.label}</label><select id="site-language" value={locale} disabled={busy} onChange={async event => {
    const value = event.target.value;
    if (!isLocale(value)) return;
    setBusy(true); setFailed(false);
    try {
      const response = await fetch('/api/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: value }) });
      if (!response.ok) throw new Error('Language update failed');
      router.refresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }}>{locales.map(value => <option key={value} value={value} lang={value}>{localeNames[value]}</option>)}</select>{failed && <span role="alert">{d.language.error}</span>}</div>;
}
