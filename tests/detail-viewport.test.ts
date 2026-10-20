import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('react', () => ({ useSyncExternalStore: vi.fn((_subscribe, snapshot) => snapshot()) }));
import { useSyncExternalStore } from 'react';
import { detailMobileMedia, useDetailMobileViewport } from '../lib/detail-viewport';

const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  vi.stubGlobal('window', { matchMedia: vi.fn(() => media) });
});
afterEach(() => vi.unstubAllGlobals());

it('promotes the eager cover on mobile and returns it to auto on desktop', () => {
  expect(useDetailMobileViewport()).toBe(false);
  media.matches = true;
  expect(useDetailMobileViewport()).toBe(true);
  expect(window.matchMedia).toHaveBeenCalledWith(detailMobileMedia);
  media.matches = false;
  expect(useDetailMobileViewport()).toBe(false);
});

it('uses the same server snapshot during hydration without accessing window', () => {
  useDetailMobileViewport();
  const serverSnapshot = vi.mocked(useSyncExternalStore).mock.calls[0][2]!;
  vi.unstubAllGlobals();
  expect(serverSnapshot()).toBe(false);
});

it('subscribes to viewport changes and removes the listener on unmount', () => {
  useDetailMobileViewport();
  const subscribe = vi.mocked(useSyncExternalStore).mock.calls[0][0];
  const changed = vi.fn();
  const unsubscribe = subscribe(changed);
  expect(media.addEventListener).toHaveBeenCalledWith('change', changed);
  unsubscribe();
  expect(media.removeEventListener).toHaveBeenCalledWith('change', changed);
});
