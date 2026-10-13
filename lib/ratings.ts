export interface Ratings { imdbRating?: string; Metascore?: string; imdbVotes?: string }
export function formatRating(value: string | number | null | undefined, maximum = 10): string {
  if (value == null || String(value).trim() === '') return 'n/a';
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= maximum ? String(numeric) : 'n/a';
}
export function formatVotes(value: string | null | undefined): string {
  if (!value || !/^\d+(,\d{3})*$/.test(value)) return 'n/a';
  const numeric = Number(value.replaceAll(',', ''));
  return Number.isSafeInteger(numeric) ? new Intl.NumberFormat('en').format(numeric) : 'n/a';
}
