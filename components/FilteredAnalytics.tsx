'use client';

import { Analytics } from '@vercel/analytics/next';
import type { ComponentProps } from 'react';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { isBotUserAgent } from '@/lib/analytics-bot-filter';

type BeforeSend = NonNullable<ComponentProps<typeof Analytics>['beforeSend']>;
type BeforeSendEvent = Parameters<BeforeSend>[0];

function isAutomatedBrowser(): boolean {
  return typeof navigator !== 'undefined' && (navigator.webdriver || isBotUserAgent(navigator.userAgent));
}

/** Drop events from bots and automated browsers (0bf7fc1). */
export function filterAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  return isAutomatedBrowser() ? null : event;
}

// Umami is an optional extra for self-hosting; Vercel Web Analytics always runs.
function UmamiScript({ websiteId }: { websiteId: string }) {
  const [allowed, setAllowed] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator is client-only
  useEffect(() => { setAllowed(!isAutomatedBrowser()); }, []);
  if (!allowed) return null;
  return <Script src="https://cloud.umami.is/script.js" data-website-id={websiteId} strategy="afterInteractive" defer />;
}

export default function FilteredAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  return <>
    <Analytics beforeSend={filterAnalyticsEvent} />
    {websiteId ? <UmamiScript websiteId={websiteId} /> : null}
  </>;
}
