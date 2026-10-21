'use client';

import { Analytics } from '@vercel/analytics/next';
import { isBotUserAgent } from '@/lib/analytics-bot-filter';

export default function FilteredAnalytics() {
  return <Analytics beforeSend={event => {
    if (typeof navigator !== 'undefined' && (navigator.webdriver || isBotUserAgent(navigator.userAgent))) {
      return null;
    }
    return event;
  }} />;
}
