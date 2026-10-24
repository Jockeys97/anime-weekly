import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installSearchHistory } from '@/lib/search-history';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function browser() {
  const events = new Map<string, (event?: unknown) => void>();
  const changes: (() => void)[] = [];
  const storage = new Map<string, string>();
  let visible = true;
  let cardY = 2500;
  const win = {
    location: new URL('https://example.test/search?genre=Action&genre=Comedy&page=2'), scrollY: 2200,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    performance: { getEntriesByType: () => [] },
    setTimeout, clearTimeout, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 1), cancelAnimationFrame: clearTimeout,
    addEventListener: (name: string, fn: (event?: unknown) => void) => events.set(name, fn),
    removeEventListener: (name: string) => events.delete(name),
    scrollTo: vi.fn((options: { top: number }) => { win.scrollY = options.top; }),
    document: {
      body: {}, querySelector: () => visible ? card : null,
      addEventListener: (name: string, fn: (event?: unknown) => void) => events.set(name, fn),
      removeEventListener: (name: string) => events.delete(name),
    },
  };
  const card = { dataset: { searchAnime: '813' }, getBoundingClientRect: () => ({ top: cardY - win.scrollY }), getClientRects: () => [1] };
  class Link {
    href = 'https://example.test/anime/813-dragon-ball-z'; target = '';
    closest(selector: string) { return selector === 'a[href]' ? this : card; }
  }
  class Observer {
    constructor(callback: () => void) { changes.push(callback); }
    observe() {} disconnect() {}
  }
  vi.stubGlobal('Element', Link); vi.stubGlobal('MutationObserver', Observer); vi.stubGlobal('ResizeObserver', Observer);
  const stop = installSearchHistory(win as unknown as Window);
  const click = (extra = {}) => events.get('click')?.({ target: new Link(), button: 0, ...extra });
  const back = () => { win.scrollY = 0; events.get('popstate')?.(); };
  return { win, events, storage, stop, click, back, changes, hide: () => { visible = false; }, show: () => { visible = true; }, shift: (y: number) => { cardY = y; } };
}

it('restores the original card offset after streamed results and later rating layout shifts', () => {
  const b = browser(); b.click();
  b.hide(); b.back(); vi.advanceTimersByTime(10);
  expect(b.win.scrollTo).not.toHaveBeenCalled();
  b.show(); b.changes.forEach(fn => fn()); vi.advanceTimersByTime(10);
  expect(b.win.scrollTo).toHaveBeenLastCalledWith({ top: 2200, behavior: 'instant' });
  b.shift(2700); b.changes.forEach(fn => fn()); vi.advanceTimersByTime(10);
  expect(b.win.scrollY).toBe(2400);
  b.stop(); expect(b.events.size).toBe(0);
});

it('stops restoring as soon as the user scrolls, without fighting their position', () => {
  const b = browser(); b.click(); b.back(); vi.advanceTimersByTime(10);
  b.events.get('wheel')?.(); b.win.scrollTo.mockClear();
  b.shift(3000); b.changes.forEach(fn => fn()); vi.advanceTimersByTime(10);
  expect(b.win.scrollTo).not.toHaveBeenCalled(); b.stop();
});

it('does not save modified clicks, new searches or visits outside search', () => {
  const b = browser(); b.click({ ctrlKey: true }); b.back(); vi.advanceTimersByTime(10);
  expect(b.win.scrollTo).not.toHaveBeenCalled();
  b.win.location = new URL('https://example.test/season/2026/fall'); b.click();
  expect(b.storage.size).toBe(0); b.stop();
});

it('keys positions by the complete query so different result pages never share scroll positions', () => {
  const b = browser(); b.click();
  b.win.location = new URL('https://example.test/search?genre=Action&genre=Comedy&page=3');
  b.back(); vi.advanceTimersByTime(10);
  expect(b.win.scrollTo).not.toHaveBeenCalled(); b.stop();
});
