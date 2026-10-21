const BOT_USER_AGENT = /bot|crawl|spider|slurp|headless|googlebot|google-inspectiontool|lighthouse|chrome-lighthouse|bingbot|yandex|baidu|duckduck|applebot|petalbot|ahrefs|semrush|mj12|bytespider|gptbot|claudebot|facebookexternalhit|phantomjs|puppeteer|playwright|selenium/i;

export function isBotUserAgent(ua: string): boolean {
  return BOT_USER_AGENT.test(ua);
}
