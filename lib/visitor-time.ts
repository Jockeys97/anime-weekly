export const DEFAULT_DATE_LOCALE = 'it-IT';
export const DEFAULT_TIME_ZONE = 'Europe/Rome';
// Intl constructors dominate repeated calendar formatting on slower phones.
// Bound the caches because server requests can contain arbitrary locale/zone input.
const formatters = new Map<string, Intl.DateTimeFormat>();
const timeZones = new Map<string, string>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([locale, Object.entries(options).sort(([a], [b]) => a.localeCompare(b))]);
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    if (formatters.size >= 100) formatters.delete(formatters.keys().next().value!);
    formatters.set(key, cached);
  }
  return cached;
}
export function validTimeZone(value?: string): string {
  if (!value || value === DEFAULT_TIME_ZONE) return DEFAULT_TIME_ZONE;
  const cached = timeZones.get(value);
  if (cached) return cached;
  let resolved = DEFAULT_TIME_ZONE;
  try { formatter(DEFAULT_DATE_LOCALE, { timeZone: value }); resolved = value; } catch { /* Use the site default. */ }
  if (timeZones.size >= 100) timeZones.delete(timeZones.keys().next().value!);
  timeZones.set(value, resolved);
  return resolved;
}
export function calendarDate(timestamp: number, timeZone = DEFAULT_TIME_ZONE): string {
  const parts = formatter('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: validTimeZone(timeZone) }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function formatVisitorDate(value: string, locale = DEFAULT_DATE_LOCALE, timeZone = DEFAULT_TIME_ZONE, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  // A date without a time is a calendar date, not a UTC instant to shift.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return formatter(locale, { ...options, timeZone: dateOnly ? 'UTC' : validTimeZone(timeZone) }).format(new Date(dateOnly ? `${value}T12:00:00Z` : value));
}
