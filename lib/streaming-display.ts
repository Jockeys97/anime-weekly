'use client';
import { useSyncExternalStore } from 'react';

const storageKey = 'aw:streaming-expanded';
const changed = 'aw:streaming-display-change';
let temporaryChoice: boolean | undefined;
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === storageKey) callback(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(changed, callback);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(changed, callback); };
}
function snapshot() {
  if (temporaryChoice !== undefined) return temporaryChoice;
  try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
}
function setExpanded(value: boolean) {
  try { localStorage.setItem(storageKey, value ? '1' : '0'); temporaryChoice = undefined; }
  catch { temporaryChoice = value; }
  window.dispatchEvent(new Event(changed));
}
export function useStreamingDisplay(): readonly [boolean, (value: boolean) => void] {
  return [useSyncExternalStore(subscribe, snapshot, () => false), setExpanded];
}
