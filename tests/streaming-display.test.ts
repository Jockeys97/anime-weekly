import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('react', () => ({ useSyncExternalStore: vi.fn((_subscribe, snapshot) => snapshot()) }));
import { useSyncExternalStore } from 'react';
const values = new Map<string, string>();
beforeEach(() => {
  vi.resetModules(); vi.mocked(useSyncExternalStore).mockClear(); values.clear();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
it('starts compact and remembers the expanded choice after navigation', async () => {
  const { useStreamingDisplay } = await import('../lib/streaming-display');
  expect(useStreamingDisplay()[0]).toBe(false);
  useStreamingDisplay()[1](true);
  expect(useStreamingDisplay()[0]).toBe(true);
  expect(values.get('aw:streaming-expanded')).toBe('1');
  useStreamingDisplay()[1](false);
  expect(useStreamingDisplay()[0]).toBe(false);
});
it('keeps the control usable when browser storage is blocked', async () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  const { useStreamingDisplay } = await import('../lib/streaming-display');
  useStreamingDisplay()[1](false);
  expect(useStreamingDisplay()[0]).toBe(false);
});
it('synchronizes toggles across cards and browser tabs, and releases listeners', async () => {
  const { useStreamingDisplay } = await import('../lib/streaming-display');
  useStreamingDisplay();
  const subscribe = vi.mocked(useSyncExternalStore).mock.calls[0][0];
  const changed = vi.fn(); const unsubscribe = subscribe(changed);
  useStreamingDisplay()[1](false);
  expect(changed).toHaveBeenCalledTimes(1);
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'aw:streaming-expanded' }));
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe(); useStreamingDisplay()[1](true);
  expect(changed).toHaveBeenCalledTimes(2);
});
