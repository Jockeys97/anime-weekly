import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.unmock('@/lib/runtime-cache');
import { fileRuntimeCache, getRuntimeCache } from '@/lib/runtime-cache';
import { runtimeCacheMock } from './runtime-cache-setup';

let directory: string | undefined;
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); if (directory) await rm(directory, { recursive: true, force: true }); });

it('shares atomic disk entries across cache instances, isolates namespaces, expires tags and honors TTL', async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'aw-runtime-'));
  const writer = fileRuntimeCache({ namespace: 'ratings' }, directory);
  const reader = fileRuntimeCache({ namespace: 'ratings' }, directory);
  const other = fileRuntimeCache({ namespace: 'personal' }, directory);
  await writer.set('private-key', { score: 8.1 }, { ttl: 60, tags: ['daily'] });
  expect(await reader.get('private-key')).toEqual({ score: 8.1 });
  expect(await other.get('private-key')).toBeNull();
  expect((await readdir(directory, { recursive: true })).join('')).not.toContain('private-key');
  await reader.set('unrelated', 'kept', { ttl: 60, tags: ['other'] });
  await reader.expireTag('daily');
  expect(await writer.get('private-key')).toBeNull();
  expect(await writer.get('unrelated')).toBe('kept');
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 61000);
  expect(await reader.get('unrelated')).toBeNull();
});

it('keeps the Vercel runtime cache when running on Vercel', async () => {
  vi.stubEnv('VERCEL', '1');
  const cache = getRuntimeCache({ namespace: 'ratings' });
  await cache.set('test', 42, { ttl: 60 });
  expect(runtimeCacheMock().set).toHaveBeenCalledWith('test', 42, { ttl: 60 });
  expect(await cache.get('test')).toBe(42);
});
