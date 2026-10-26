'use client';
import { useLocale } from '@/components/LanguageSelector';
import { useEffect, useRef, useState } from 'react';
import { getDictionary } from '@/lib/i18n';
import { loadSynopsis, synopsisQuery, type SynopsisResult } from '@/lib/synopsis-client';
import type { Locale } from '@/lib/locales';
import { observeNearViewport } from '@/lib/viewport-observer';

export function LocalizedSynopsis({ original, titles, year, kind, locale, anilistId, initial, followLocale = false, retryMissing = false, expandable = false, className = 'synopsis catalog-synopsis' }: {
  expandable?: boolean; original: string; titles: string[]; anilistId: number; year?: number; kind: 'tv' | 'movie'; locale: Locale; className?: string; initial?: SynopsisResult; followLocale?: boolean; retryMissing?: boolean;
}) {
  const selectedLocale = useLocale();
  const activeLocale = followLocale ? selectedLocale : locale;
  return <SynopsisContent key={activeLocale} original={original} titles={titles} year={year} kind={kind} locale={activeLocale} anilistId={anilistId} initial={initial?.language === activeLocale || activeLocale === locale ? initial : undefined} retryMissing={retryMissing} expandable={expandable} className={className} />;
}

function SynopsisContent({ original, titles, year, kind, locale, anilistId, initial, retryMissing, expandable = false, className }: {
  expandable?: boolean;
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
    const timer = retryMissing ? setTimeout(load, 0) : undefined;
    const stopObserving = timer === undefined ? observeNearViewport(ref.current, load, '150px') : undefined;
    // Also settle when an observer never fires (for example a hidden card).
    const deadline = setTimeout(() => { if (!cancelled) setChecked(true); }, 31000);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(deadline); stopObserving?.(); };
  }, [locale, query, initial, retryMissing]);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const pending = locale !== 'en' && Boolean(original) && !translation && !checked;
  const text = pending ? d.language.loadingSynopsis : translation || original || d.state.noSynopsis;
  useEffect(() => {
    const el = textRef.current;
    if (!expandable || !el || expanded) return;
    const measure = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [expandable, expanded, text]);
  const toggle = expandable && (truncated || expanded) ? () => setExpanded(value => !value) : undefined;
  return <div ref={ref} className="localized-synopsis">
    <p ref={textRef} className={`${className}${expandable ? ' synopsis-expandable' : ''}${expanded ? ' is-expanded' : ''}`} onClick={toggle} onKeyDown={toggle ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } } : undefined} role={pending ? 'status' : toggle ? 'button' : undefined} tabIndex={toggle ? 0 : undefined} aria-expanded={toggle ? expanded : undefined} lang={pending || translation ? locale : original ? 'en' : locale}>{text}</p>
    {locale !== 'en' && <p className="synopsis-fallback">{translation && machine ? `${d.language.machineTranslation} · DeepL` : original && !translation && checked ? d.language.originalSynopsis : '\u00a0'}</p>}
  </div>;
}
