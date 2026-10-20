import { afterEach, expect, it, vi } from 'vitest';
import { observeNearViewport } from '../lib/viewport-observer';

afterEach(() => vi.unstubAllGlobals());

it('shares an observer across cards, loads once, and cancels unmounted targets', () => {
  let deliver!: IntersectionObserverCallback;
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  const construct = vi.fn(function (callback: IntersectionObserverCallback) {
    deliver = callback;
    return observer;
  });
  vi.stubGlobal('IntersectionObserver', construct);
  const first = {} as Element;
  const second = {} as Element;
  const loadFirst = vi.fn();
  const loadSecond = vi.fn();
  const stopFirst = observeNearViewport(first, loadFirst);
  const stopSecond = observeNearViewport(second, loadSecond);
  expect(construct).toHaveBeenCalledTimes(1);
  deliver([{ target: first, isIntersecting: false }] as IntersectionObserverEntry[], observer as unknown as IntersectionObserver);
  expect(loadFirst).not.toHaveBeenCalled();
  stopSecond();
  const entries = [{ target: first, isIntersecting: true }, { target: second, isIntersecting: true }] as IntersectionObserverEntry[];
  deliver(entries, observer as unknown as IntersectionObserver);
  deliver(entries, observer as unknown as IntersectionObserver);
  expect(loadFirst).toHaveBeenCalledTimes(1);
  expect(loadSecond).not.toHaveBeenCalled();
  stopFirst();
  const stopNext = observeNearViewport({} as Element, vi.fn());
  expect(construct).toHaveBeenCalledTimes(2);
  stopNext();
});

it('loads immediately without IntersectionObserver support', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const load = vi.fn();
  observeNearViewport({} as Element, load)();
  expect(load).toHaveBeenCalledTimes(1);
});
