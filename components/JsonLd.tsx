import { serializeJsonLd } from '@/lib/seo';

export function JsonLd({ data }: { data: unknown }) {
  // An empty ItemList/BreadcrumbList is invalid structured data: emit nothing.
  const list = data && typeof data === 'object' ? (data as { itemListElement?: unknown }).itemListElement : undefined;
  if (Array.isArray(list) && list.length === 0) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
