import { beforeEach, vi } from 'vitest';
const runtime = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return { values, expireTag: vi.fn(async (_tag: string) => { void _tag; }), get: vi.fn(async (key: string) => values.get(key) ?? null), set: vi.fn(async (key: string, value: unknown, options?: { ttl?: number; tags?: string[] }) => { void options; values.set(key, value); }) };
});
vi.mock('@vercel/functions', () => ({ getCache: () => ({ get: runtime.get, set: runtime.set, expireTag: runtime.expireTag }) }));
beforeEach(() => { runtime.values.clear(); runtime.expireTag.mockReset().mockResolvedValue(undefined); runtime.get.mockReset().mockImplementation(async key => runtime.values.get(key) ?? null); runtime.set.mockReset().mockImplementation(async (key, value) => { runtime.values.set(key, value); }); });

export function runtimeCacheMock() { return runtime; }
