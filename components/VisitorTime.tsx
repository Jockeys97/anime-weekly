'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_DATE_LOCALE, DEFAULT_TIME_ZONE, formatVisitorDate, validTimeZone } from '@/lib/visitor-time';
const VisitorTimeContext = createContext({ locale: DEFAULT_DATE_LOCALE, timeZone: DEFAULT_TIME_ZONE });
export function VisitorTimeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState({ locale: DEFAULT_DATE_LOCALE, timeZone: DEFAULT_TIME_ZONE });
  useEffect(() => {
    const timer = setTimeout(() => setSettings({ locale: navigator.language || DEFAULT_DATE_LOCALE, timeZone: validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) }), 0);
    return () => clearTimeout(timer);
  }, []);
  return <VisitorTimeContext.Provider value={settings}>{children}</VisitorTimeContext.Provider>;
}
export const useVisitorTime = () => useContext(VisitorTimeContext);
export function VisitorDate({ value, options }: { value: string; options?: Intl.DateTimeFormatOptions }) {
  const { locale, timeZone } = useVisitorTime();
  return <time dateTime={value}>{formatVisitorDate(value, locale, timeZone, options)}</time>;
}
