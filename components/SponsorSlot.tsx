'use client';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
export function SponsorSlot() { const d = getDictionary(useLocale()); return <aside className="sponsor"><span className="eyebrow">{d.sponsor.label}</span><p>{d.sponsor.body}</p><span aria-hidden="true">✦</span></aside>; }
