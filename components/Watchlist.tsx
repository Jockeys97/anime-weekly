'use client';
import { useState, useSyncExternalStore } from 'react';
import { getDictionary } from '@/lib/i18n';
import { useLocale } from '@/components/LanguageSelector';
import { parseWatchlist, WATCHLIST_KEY, toggleWatchlist } from '@/lib/watchlist';
const changed = 'aw:watchlist-change';
function subscribe(callback: () => void) {
  const listener = () => callback();
  window.addEventListener('storage', listener); window.addEventListener(changed, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(changed, listener); };
}
function snapshot() { try { return localStorage.getItem(WATCHLIST_KEY) ?? '[]'; } catch { return '[]'; } }
export function useWatchlist() { return parseWatchlist(useSyncExternalStore(subscribe, snapshot, () => '[]')); }
export function WatchlistButton({ id }: { id: string }) {
  const ids = useWatchlist(); const d = getDictionary(useLocale()).features;
  const [failed, setFailed] = useState(false); const selected = ids.includes(id);
  return <><button type="button" className="watchlist-button" aria-pressed={selected} aria-label={selected ? d.remove : d.save} onClick={() => {
    let ok = false;
    try { ok = toggleWatchlist(localStorage, id); } catch { /* Storage may be blocked. */ }
    setFailed(!ok); if (ok) window.dispatchEvent(new Event(changed));
  }}><span aria-hidden="true">{selected ? '♥' : '♡'}</span> {selected ? d.saved : d.save}</button>{failed && <p role="status">{d.storageError}</p>}</>;
}
