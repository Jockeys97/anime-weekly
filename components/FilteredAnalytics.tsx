'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { isBotUserAgent } from '@/lib/analytics-bot-filter';

export default function FilteredAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(!navigator.webdriver && !isBotUserAgent(navigator.userAgent));
  }, []);
  if (!websiteId || !allowed) return null;
  return <Script src="https://cloud.umami.is/script.js" data-website-id={websiteId} strategy="afterInteractive" defer />;
}
