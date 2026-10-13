import { getDictionary } from '@/lib/i18n';
export function SponsorSlot() { const d = getDictionary(); return <aside className="sponsor"><span className="eyebrow">{d.sponsor.label}</span><p>{d.sponsor.body}</p><span aria-hidden="true">✦</span></aside>; }
