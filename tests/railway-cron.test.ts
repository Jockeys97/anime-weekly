import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

// Execute the actual dependency-free script with an isolated process and HTTP
// boundary. No listening sockets or global process.exitCode changes in Vitest.
async function run(status = 200, body = '{"revalidated":true}', secret = 'fixture', appUrl = 'https://fixture.test/base', offline = false) {
  const source = await readFile(new URL('../scripts/cron.mjs', import.meta.url), 'utf8');
  const fetcher = vi.fn(async () => {
    if (offline) throw new Error('Network failure with sensitive details');
    return new Response(body, { status });
  });
  const process = { env: { APP_URL: appUrl, CRON_SECRET: secret }, exitCode: 0 };
  const logger = { info: vi.fn(), error: vi.fn() };
  await runInNewContext(`(async () => { ${source}\n })()`, { process, fetch: fetcher, URL, AbortSignal, console: logger });
  return { fetcher, process, logger };
}

it('calls the app with only Bearer auth and exits successfully', async () => {
  const { fetcher, process } = await run();
  expect(process.exitCode).toBe(0);
  expect(fetcher).toHaveBeenCalledWith(new URL('https://fixture.test/api/revalidate'), {
    method: 'GET', headers: { Authorization: 'Bearer fixture' }, redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal),
  });
});
it.each([[503, '{}'], [302, '{}'], [200, '{}'], [200, 'invalid JSON']])('fails closed on HTTP %i / %s', async (status, body) => {
  const { fetcher, process } = await run(status, body);
  expect(process.exitCode).toBe(1);
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each([['   ', 'https://fixture.test'], ['fixture', ''], ['fixture', 'file:///tmp/cache']])('rejects invalid configuration before any request', async (secret, appUrl) => {
  const { fetcher, process } = await run(200, '{}', secret, appUrl);
  expect(process.exitCode).toBe(1);
  expect(fetcher).not.toHaveBeenCalled();
});
it('fails on network errors without logging upstream exception details', async () => {
  const { process, logger } = await run(200, '{}', 'fixture', 'https://fixture.test', true);
  expect(process.exitCode).toBe(1);
  expect(JSON.stringify(logger.error.mock.calls)).not.toContain('sensitive details');
});
