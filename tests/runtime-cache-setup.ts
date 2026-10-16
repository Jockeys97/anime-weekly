import { beforeEach, vi } from 'vitest';
const runtime = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return { values, get: vi.fn(async (key: string) => values.get(key) ?? null), set: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }) };
});
vi.mock('@vercel/functions', () => ({ getCache: () => ({ get: runtime.get, set: runtime.set }) }));
beforeEach(() => { runtime.values.clear(); runtime.get.mockReset().mockImplementation(async key => runtime.values.get(key) ?? null); runtime.set.mockReset().mockImplementation(async (key, value) => { runtime.values.set(key, value); }); });

export function runtimeCacheMock() { return runtime; }
