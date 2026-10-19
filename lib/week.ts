const DAY = 86400000;
export interface ISOWeek { year: number; week: number }
function utcDate(year: number, month: number, day: number) {
  const date = new Date(0); date.setUTCFullYear(year, month, day); date.setUTCHours(0, 0, 0, 0); return date;
}
export function isoWeek(date: Date): ISOWeek {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date');
  const thursday = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  return { year, week: Math.ceil(((thursday.getTime() - utcDate(year, 0, 1).getTime()) / DAY + 1) / 7) };
}
export function formatWeek(value: ISOWeek): string {
  return `${String(value.year).padStart(4, '0')}-${String(value.week).padStart(2, '0')}`;
}
export function weekRange(value: ISOWeek) {
  const jan4 = utcDate(value.year, 0, 4);
  const monday = new Date(jan4.getTime() + ((value.week - 1) * 7 - ((jan4.getUTCDay() || 7) - 1)) * DAY);
  const sunday = new Date(monday.getTime() + 6 * DAY);
  return { monday, sunday, start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}
export function parseWeek(value: string): ISOWeek | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, week] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || week < 1 || week > 53) return null;
  const parsed = { year, week };
  return formatWeek(isoWeek(weekRange(parsed).monday)) === value ? parsed : null;
}
// Calendar dates stay in UTC, independent of the visitor's timezone.
export function weekDateRange(value: ISOWeek, locale = 'it'): string {
  const { monday, sunday } = weekRange(value);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatRange(monday, sunday);
}
export function shiftWeek(value: ISOWeek, offset: number): ISOWeek {
  return isoWeek(new Date(weekRange(value).monday.getTime() + offset * 7 * DAY));
}
