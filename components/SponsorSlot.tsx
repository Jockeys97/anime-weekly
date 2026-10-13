import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
export async function SponsorSlot() { const d = getDictionary(await getRequestLocale()); return <aside className="sponsor"><span className="eyebrow">{d.sponsor.label}</span><p>{d.sponsor.body}</p><span aria-hidden="true">✦</span></aside>; }
