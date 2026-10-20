'use client';
import { useSyncExternalStore } from 'react';

// Keep in sync with the banner visibility rule in globals.css.
export const detailMobileMedia = '(max-width: 720px)';
export const detailDesktopMedia = '(min-width: 721px)';
export const emptyDetailImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function subscribe(callback: () => void) {
  const media = window.matchMedia(detailMobileMedia);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export function useDetailMobileViewport() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(detailMobileMedia).matches, () => false);
}
