import { describe, expect, it } from 'vitest';
import { trailerLinks } from '../lib/trailer';
describe('record-specific trailer links', () => {
  it('uses the exact video ID attached to the anime cour', () => {
    expect(trailerLinks({ site: 'youtube', id: 'vPBU0xBjFFY' })).toEqual({ watch: 'https://www.youtube.com/watch?v=vPBU0xBjFFY', embed: 'https://www.youtube-nocookie.com/embed/vPBU0xBjFFY?autoplay=1' });
  });
  it('supports Dailymotion trailers', () => {
    expect(trailerLinks({ site: 'dailymotion', id: 'x123abc' })?.embed).toBe('https://www.dailymotion.com/embed/video/x123abc?autoplay=1');
  });
  it('does not guess or generate unsafe trailer URLs', () => {
    for (const trailer of [null, undefined, { site: 'youtube', id: null }, { site: 'unknown', id: 'vPBU0xBjFFY' }, { site: 'youtube', id: 'vPBU0xBjFFY?other' }, { site: 'dailymotion', id: '../abc123' }]) expect(trailerLinks(trailer)).toBeNull();
  });
});
