import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// The installed 16.4 build still exposes the helper under its middleware name.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from '../proxy';

it.each(['cyberpunk-edgerunners-2', '-1', '1.5', '21-', '%E0%A4%A', '%63yberpunk'])('rewrites invalid detail ID %s to the unmatched 404 route', id => {
  const response = proxy(new NextRequest(`https://weeklyanime.com/anime/${id}?source=test`));
  expect(response.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/404?source=test');
});

it.each(['21', '999999999', '21-one-piece', '21-cyberpunk-2', '%32%31'])('passes numeric and future slug ID %s through to the route', id => {
  const response = proxy(new NextRequest(`https://weeklyanime.com/anime/${id}`));
  expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  expect(response.headers.get('x-middleware-next')).toBe('1');
});

it.each([
  ['/anime/21', true], ['/anime/cyberpunk-edgerunners-2', true],
  ['/anime', false], ['/anime/21/extra', false], ['/week/2026-99', false],
  ['/api/anime-card/21', false], ['/_next/static/test.js', false], ['/', false],
])('matches only single-segment anime details: %s', (url, expected) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(expected);
});
