'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getDictionary } from '@/lib/i18n';
import { isLocale, localeNames, locales, negotiateLocale, type Locale } from '@/lib/locales';
const LocaleContext = createContext<{ locale: Locale; select: (locale: Locale) => void }>({ locale: 'it', select: () => {} });
export function LocaleProvider({ locale = 'it', children }: { locale?: Locale; children: ReactNode }) {
  const [selected, setSelected] = useState(locale);
  const manuallySelected = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    // Read the existing HttpOnly preference through a separate endpoint. The
    // shared document never depends on request headers or cookies.
    fetch('/api/language', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null)
      .then(data => {
        if (!controller.signal.aborted && !manuallySelected.current) {
          setSelected(negotiateLocale(navigator.languages?.join(',') || navigator.language || 'it-IT', data?.locale));
        }
      });
    return () => controller.abort();
  }, []);
  useEffect(() => { document.documentElement.lang = selected; }, [selected]);
  return <LocaleContext.Provider value={{ locale: selected, select: value => { manuallySelected.current = true; setSelected(value); } }}>{children}</LocaleContext.Provider>;
}
export const useLocale = () => useContext(LocaleContext).locale;
export function LanguageSelector({ locale: fallback }: { locale?: Locale }) {
  const context = useContext(LocaleContext);
  const locale = fallback ?? context.locale;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const d = getDictionary(locale);
  return <div className="language-control"><label className="sr-only" htmlFor="site-language">{d.language.label}</label><select id="site-language" value={locale} disabled={busy} aria-busy={busy} onChange={async event => {
    const value = event.target.value;
    if (!isLocale(value)) return;
    setFailed(false); setBusy(true);
    try {
      const response = await fetch('/api/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: value }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Language update failed');
      context.select(value);
      // Request-local catalog/detail segments still use the saved preference.
      router.refresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }}>{locales.map(value => <option key={value} value={value} lang={value}>{localeNames[value]}</option>)}</select>{failed && <span role="alert">{d.language.error}</span>}</div>;
}
