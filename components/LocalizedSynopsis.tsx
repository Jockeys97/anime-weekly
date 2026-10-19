'use client';
import { useLocale } from '@/components/LanguageSelector';
import { useEffect, useRef, useState } from 'react';
import { getDictionary } from '@/lib/i18n';
import { loadSynopsis, synopsisQuery, type SynopsisResult } from '@/lib/synopsis-client';
import type { Locale } from '@/lib/locales';

export function LocalizedSynopsis({ original, titles, year, kind, locale, anilistId, initial, followLocale = false, retryMissing = false, className = 'synopsis catalog-synopsis' }: {
  original: string; titles: string[]; anilistId: number; year?: number; kind: 'tv' | 'movie'; locale: Locale; className?: string; initial?: SynopsisResult; followLocale?: boolean; retryMissing?: boolean;
}) {
  const selectedLocale = useLocale();
  const activeLocale = followLocale ? selectedLocale : locale;
  return <SynopsisContent key={activeLocale} original={original} titles={titles} year={year} kind={kind} locale={activeLocale} anilistId={anilistId} initial={initial?.language === activeLocale || activeLocale === locale ? initial : undefined} retryMissing={retryMissing} className={className} />;
}

function SynopsisContent({ original, titles, year, kind, locale, anilistId, initial, retryMissing, className }: {
  original: string; titles: string[]; anilistId: number; year?: number; kind: 'tv' | 'movie'; locale: Locale; className: string; initial?: SynopsisResult; retryMissing: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [translation, setTranslation] = useState<string | null>(initial?.language === locale ? initial.synopsis : null);
  const [machine, setMachine] = useState(initial?.source === 'deepl');
  const [checked, setChecked] = useState(Boolean(initial));
  const d = getDictionary(locale);
  const query = synopsisQuery(locale, kind, anilistId, titles, year);
  useEffect(() => {
    if ((initial && (!retryMissing || (initial.language === locale && initial.synopsis?.trim()))) || locale === 'en' || !ref.current) return;
    let cancelled = false;
    const load = () => {
      loadSynopsis(query).then(data => {
        if (!cancelled && data.language === locale && data.synopsis?.trim()) {
          setTranslation(data.synopsis); setMachine(data.source === 'deepl');
        }
      }).catch(() => { /* Show the labelled original only if translation fails. */ })
        .finally(() => { if (!cancelled) setChecked(true); });
    };
    let observer: IntersectionObserver | undefined;
    const timer = retryMissing || typeof IntersectionObserver === 'undefined' ? setTimeout(load, 0) : undefined;
    if (timer === undefined) {
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer?.disconnect(); load();
      }, { rootMargin: '150px' });
      observer.observe(ref.current);
    }
    // Also settle when an observer never fires (for example a hidden card).
    const deadline = setTimeout(() => { if (!cancelled) setChecked(true); }, 31000);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(deadline); observer?.disconnect(); };
  }, [locale, query, initial, retryMissing]);
  const pending = locale !== 'en' && Boolean(original) && !translation && !checked;
  return <div ref={ref} className="localized-synopsis">
    <p className={className} lang={pending || translation ? locale : original ? 'en' : locale} role={pending ? 'status' : undefined}>{pending ? d.language.loadingSynopsis : translation || original || d.state.noSynopsis}</p>
    {translation && machine && <p className="synopsis-fallback">{d.language.machineTranslation} · DeepL</p>}
    {locale !== 'en' && original && !translation && checked && <p className="synopsis-fallback">{d.language.originalSynopsis}</p>}
  </div>;
}
