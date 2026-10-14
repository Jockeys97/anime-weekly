export const DEFAULT_DATE_LOCALE = 'it-IT';
export const DEFAULT_TIME_ZONE = 'Europe/Rome';
export function validTimeZone(value?: string): string {
  try { if (value) { new Intl.DateTimeFormat(DEFAULT_DATE_LOCALE, { timeZone: value }); return value; } } catch { /* Use the site default. */ }
  return DEFAULT_TIME_ZONE;
}
export function calendarDate(timestamp: number, timeZone = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: validTimeZone(timeZone) }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function formatVisitorDate(value: string, locale = DEFAULT_DATE_LOCALE, timeZone = DEFAULT_TIME_ZONE, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  // A date without a time is a calendar date, not a UTC instant to shift.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: dateOnly ? 'UTC' : validTimeZone(timeZone) }).format(new Date(dateOnly ? `${value}T12:00:00Z` : value));
}
