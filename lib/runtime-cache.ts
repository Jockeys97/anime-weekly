import 'server-only';
import { getCache, type RuntimeCache } from '@vercel/functions';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Options = NonNullable<Parameters<typeof getCache>[0]>;
interface Entry { value: unknown; expiresAt: number; tags: string[] }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

// A single self-hosted instance shares these files across Next route bundles.
// This store is separate from Next's tagged Data Cache, under the same optional
// persistent volume. Only hashed keys and namespaces become filenames.
export function fileRuntimeCache(options: Options, root = path.join(process.cwd(), '.next/cache/runtime')): RuntimeCache {
  const directory = path.join(root, digest(options.namespace ?? 'default'));
  const filename = (key: string) => path.join(directory, `${digest(options.keyHashFunction?.(key) ?? key)}.json`);
  let nextSweep = 0;
  async function read(file: string): Promise<Entry | null> {
    try { return JSON.parse(await readFile(file, 'utf8')) as Entry; }
    catch (error) { if (missing(error) || error instanceof SyntaxError) return null; throw error; }
  }
  async function sweep(tags: string[] = []) {
    const files = await readdir(directory).catch(error => { if (missing(error)) return []; throw error; });
    const entries = files.filter(file => file.endsWith('.json'));
    let index = 0;
    // IMDb has hundreds of compressed partitions per day. Bound concurrent
    // reads so sweeping a persistent volume cannot load them all into memory.
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (index < entries.length) {
        const target = path.join(directory, entries[index++]), entry = await read(target);
        if (!entry || entry.expiresAt <= Date.now() || entry.tags.some(tag => tags.includes(tag))) await rm(target, { force: true });
      }
    }));
  }
  return {
    async get(key) {
      const file = filename(key), entry = await read(file);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) { await rm(file, { force: true }); return null; }
      return entry.value;
    },
    async set(key, value, settings) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if (Date.now() >= nextSweep) { nextSweep = Date.now() + 3600000; await sweep(); }
      const file = filename(key), temporary = `${file}.${randomUUID()}.tmp`;
      const entry: Entry = { value, expiresAt: Date.now() + (settings?.ttl ?? 86400) * 1000, tags: settings?.tags ?? [] };
      try {
        await writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
        await rename(temporary, file);
      } finally { await rm(temporary, { force: true }); }
    },
    async delete(key) { await rm(filename(key), { force: true }); },
    async expireTag(tag) { await sweep(Array.isArray(tag) ? tag : [tag]); },
  };
}

export function getRuntimeCache(options: Options): RuntimeCache {
  return process.env.VERCEL === '1' ? getCache(options) : fileRuntimeCache(options);
}
