import type { ReactNode } from 'react';
import { withAffiliate } from '@/lib/affiliate';
export function ProviderLink({ href, children, affiliate, label }: { href: string; children: ReactNode; affiliate?: { name: string; value: string }; label?: string }) {
  return <a href={withAffiliate(href, affiliate)} target="_blank" rel="noopener noreferrer" aria-label={label} className="provider-link">{children}</a>;
}
