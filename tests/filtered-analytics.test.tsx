// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => <i data-testid="vercel-analytics" /> }));
vi.mock('next/script', () => ({ default: (props: { src: string }) => <i data-src={props.src} /> }));
import FilteredAnalytics, { filterAnalyticsEvent } from '@/components/FilteredAnalytics';

const event = { type: 'pageview' as const, url: 'https://weeklyanime.com/' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('FilteredAnalytics', () => {
  it('always mounts Vercel Web Analytics, even without Umami', () => {
    vi.stubEnv('NEXT_PUBLIC_UMAMI_WEBSITE_ID', '');
    expect(renderToStaticMarkup(<FilteredAnalytics />)).toContain('vercel-analytics');
  });
  it('keeps human events and drops bots / webdriver', () => {
    vi.stubGlobal('navigator', { webdriver: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' });
    expect(filterAnalyticsEvent(event)).toBe(event);
    vi.stubGlobal('navigator', { webdriver: false, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
    expect(filterAnalyticsEvent(event)).toBeNull();
    vi.stubGlobal('navigator', { webdriver: true, userAgent: 'Mozilla/5.0 Chrome/131' });
    expect(filterAnalyticsEvent(event)).toBeNull();
  });
});
