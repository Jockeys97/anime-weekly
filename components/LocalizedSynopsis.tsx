'use client';
import { useEffect, useRef, useState } from 'react';
import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';

export function LocalizedSynopsis({ original, titles, year, kind, locale, anilistId, className = 'synopsis catalog-synopsis' }: {
  original: string; titles: string[]; anilistId: number; year?: number; kind: 'tv' | 'movie'; locale: Locale; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [machine, setMachine] = useState(false);
  const [checked, setChecked] = useState(false);
  const d = getDictionary(locale);
  const params = new URLSearchParams({ locale, kind, anilist: String(anilistId) });
  titles.filter(title => title.trim()).slice(0, 3).forEach(title => params.append('title', title.slice(0, 200)));
  if (year) params.set('year', String(year));
  const query = params.toString();
  useEffect(() => {
    if (locale === 'en' || !ref.current) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      fetch(`/api/synopsis?${query}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && data.language === locale && typeof data.synopsis === 'string' && data.synopsis.trim()) {
          setTranslation(data.synopsis); setMachine(data.source === 'deepl');
        }
      }).catch(() => { /* The explicitly labelled English source remains visible. */ }).finally(() => { if (!controller.signal.aborted) setChecked(true); });
    }, { rootMargin: '150px' });
    observer.observe(ref.current);
    return () => { observer.disconnect(); controller.abort(); };
  }, [locale, query]);
  return <div ref={ref}>
    <p className={className} lang={translation ? locale : original ? 'en' : locale}>{translation || original || d.state.noSynopsis}</p>
    {translation && machine && <p className="synopsis-fallback">{d.language.machineTranslation} · DeepL</p>}
    {locale !== 'en' && original && !translation && <p className="synopsis-fallback">{checked ? d.language.originalSynopsis : d.language.loadingSynopsis}</p>}
  </div>;
}
