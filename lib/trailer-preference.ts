'use client';
import { useSyncExternalStore } from 'react';

// Hover trailer previews on the weekly calendar: on unless the visitor turns them off.
const storageKey = 'aw:glance-trailers';
const changed = 'aw:glance-trailers-change';
let temporaryChoice: boolean | undefined;
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === storageKey) callback(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(changed, callback);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(changed, callback); };
}
function snapshot() {
  if (temporaryChoice !== undefined) return temporaryChoice;
  try { return localStorage.getItem(storageKey) !== '0'; } catch { return true; }
}
function setEnabled(value: boolean) {
  try { localStorage.setItem(storageKey, value ? '1' : '0'); temporaryChoice = undefined; }
  catch { temporaryChoice = value; }
  window.dispatchEvent(new Event(changed));
}
export function useTrailerPreviews(): readonly [boolean, (value: boolean) => void] {
  return [useSyncExternalStore(subscribe, snapshot, () => true), setEnabled];
}
