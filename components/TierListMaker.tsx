'use client';

import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { AnimeSeason } from '@/lib/season';
import {
  cleanLabel, emptyBoard, itemTier, moveItem, parseBoard, tierImageProxy, tierStorageKey, type Tier, type TierBoard, type TierItem,
} from '@/lib/tier-list';
import styles from './TierListMaker.module.css';

// Storage-backed board shared through an external store, like the watchlist.
// The in-memory copy keeps the board usable when storage is blocked or full.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
function readStored(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Storage may be blocked. */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key) memory.delete(event.key); listener(); };
  listeners.add(listener); window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
const noSubscribe = () => () => {};
function canShareFiles() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}

const POOL = 'pool';
const FIRST_ROW = 4; // posters that fit the first pool row on a phone load eagerly; the rest are lazy
const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ');
const itemKey = (id: number) => `item:${id}`;
const beforeKey = (id: number) => `before:${id}`;
const idFrom = (value: string | number, prefix: string) => String(value).startsWith(prefix) ? Number(String(value).slice(prefix.length)) : null;

// Nested droppables: a poster under the pointer wins over its row, so items
// can be reordered; keyboard dragging falls back to rectangle intersection.
const collisions: CollisionDetection = args => {
  const own = beforeKey(idFrom(args.active.id, 'item:') ?? -1);
  const hits = pointerWithin(args).filter(hit => hit.id !== own);
  const list = hits.length ? hits : rectIntersection(args).filter(hit => hit.id !== own);
  return [...list].sort((a, b) => Number(String(b.id).startsWith('before:')) - Number(String(a.id).startsWith('before:')));
};

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(tierImageProxy(url));
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export function TierListMaker({ locale, season, seasonName, items, shareUrl }: {
  locale: Locale; season: AnimeSeason; seasonName: string; items: TierItem[]; shareUrl: string;
}) {
  const t = getDictionary(locale).tierList;
  const key = tierStorageKey(season);
  const ids = useMemo(() => items.map(item => item.id), [items]);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const raw = useSyncExternalStore(subscribe, () => readStored(key), () => null);
  const board = useMemo(() => parseBoard(raw, ids), [raw, ids]);
  const save = useCallback((next: TierBoard) => writeStored(key, JSON.stringify(next)), [key]);
  const placed = useMemo(() => new Set(Object.values(board.rows).flat()), [board]);
  const pool = items.filter(item => !placed.has(item.id));
  const shareFiles = useSyncExternalStore(noSubscribe, canShareFiles, () => false);

  const [selected, setSelected] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [exporting, setExporting] = useState<Map<number, string | null> | null>(null);
  const [error, setError] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const place = useCallback((id: number, tierId: string | null, beforeId?: number) => {
    save(moveItem(board, id, tierId, beforeId));
  }, [board, save]);
  const onDragStart = ({ active: dragged }: DragStartEvent) => { setActive(idFrom(dragged.id, 'item:')); setSelected(null); };
  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActive(null);
    // A drag ends with a click on a common ancestor; ignore it as a tap.
    justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 300);
    const id = idFrom(dragged.id, 'item:');
    if (id === null || !over) return;
    const before = idFrom(over.id, 'before:');
    if (before !== null) { if (before !== id) place(id, itemTier(board, before), before); return; }
    const target = String(over.id);
    if (target === POOL) place(id, null);
    else if (target.startsWith('tier:')) place(id, target.slice('tier:'.length));
  };
  const tap = (id: number) => {
    if (justDragged.current) return;
    setSelected(current => current === id ? null : id);
  };
  const tapTarget = (tierId: string | null) => {
    if (selected === null || justDragged.current) return;
    place(selected, tierId); setSelected(null);
  };
  const rename = (tier: Tier, value: string) => {
    const label = cleanLabel(value, tier.label);
    if (label !== tier.label) save({ ...board, tiers: board.tiers.map(item => item.id === tier.id ? { ...item, label } : item) });
  };
  const reset = () => { setSelected(null); save(emptyBoard()); };

  const renderPng = async (): Promise<Blob> => {
    const exportUrl = (id: number) => { const item = byId.get(id); return item?.exportPoster ?? item?.poster; };
    const urls = [...new Set(Object.values(board.rows).flat().map(exportUrl).filter((url): url is string => Boolean(url)))];
    const sources = new Map<number, string | null>();
    const data = new Map(await Promise.all(urls.map(async url => [url, await toDataUrl(url)] as const)));
    for (const id of placed) { const poster = exportUrl(id); sources.set(id, poster ? data.get(poster) ?? null : null); }
    setExporting(sources);
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const node = exportRef.current;
      if (!node) throw new Error('Export board missing');
      await Promise.all([...node.querySelectorAll('img')].map(img => img.decode().catch(() => undefined)));
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(node, { pixelRatio: 1.5, backgroundColor: '#1a1a1a', skipFonts: true, cacheBust: false });
      if (!blob) throw new Error('Empty export');
      return blob;
    } finally { setExporting(null); }
  };
  const fileName = `tier-list-${season.season}-${season.year}.png`;
  const shareText = t.shareText.replace('{season}', seasonName).replace('{year}', String(season.year));
  const withExport = async (work: (blob: Blob) => Promise<void> | void) => {
    if (exporting) return;
    setError(false);
    try { await work(await renderPng()); }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true); }
  };
  const download = () => withExport(blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  const share = () => withExport(async blob => {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: shareText, text: shareText, url: shareUrl });
    else await navigator.share({ title: shareText, text: shareText, url: shareUrl });
  });
  const xUrl = `https://x.com/intent/post?${new URLSearchParams({ text: shareText, url: shareUrl })}`;
  const redditUrl = `https://www.reddit.com/submit?${new URLSearchParams({ url: shareUrl, title: shareText })}`;
  const activeItem = active === null ? undefined : byId.get(active);

  return <section className={styles.maker} aria-label={t.title}>
    <div className={styles.toolbar}>
      <button type="button" className="button" onClick={download} disabled={Boolean(exporting)}>{exporting ? t.exporting : t.download}</button>
      {shareFiles && <button type="button" className={styles.secondary} onClick={share} disabled={Boolean(exporting)}>{t.share}</button>}
      <a className={styles.secondary} href={xUrl} target="_blank" rel="noopener noreferrer">{t.shareX}</a>
      <a className={styles.secondary} href={redditUrl} target="_blank" rel="noopener noreferrer">{t.shareReddit}</a>
      <button type="button" className={`${styles.secondary} ${styles.reset}`} onClick={reset}>{t.reset}</button>
    </div>
    {error && <p className={styles.error} role="alert">{t.exportError}</p>}
    <p className={styles.status} role="status" aria-live="polite">{selected !== null && <>
      <span>{t.selected.replace('{name}', byId.get(selected)?.name ?? '')}</span>
      <button type="button" onClick={() => setSelected(null)}>{t.cancel}</button>
    </>}</p>
    {selected !== null && <aside className={styles.quickPlace} aria-label={t.chooseTier}>
      <div className={styles.quickHeader}>
        <strong>{byId.get(selected)?.name}</strong>
        <button type="button" className={styles.secondary} onClick={() => setSelected(null)}>{t.cancel}</button>
      </div>
      <p>{t.chooseTier}</p>
      <div className={styles.quickTiers}>
        {board.tiers.map(tier => <button key={tier.id} type="button" style={{ background: tier.color }} onClick={() => tapTarget(tier.id)}>{tier.label}</button>)}
        {placed.has(selected) && <button type="button" onClick={() => tapTarget(null)}>{t.unranked}</button>}
      </div>
    </aside>}
    <DndContext sensors={sensors} collisionDetection={collisions} autoScroll={{ acceleration: 24, threshold: { x: .15, y: .25 } }} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={styles.board}>
        {board.tiers.map(tier => <TierRow key={tier.id} tier={tier} picking={selected !== null} onTap={() => tapTarget(tier.id)} onRename={value => rename(tier, value)} editLabel={t.editLabel}>
          {board.rows[tier.id].map(id => byId.get(id)).filter((item): item is TierItem => Boolean(item)).map(item =>
            <DraggablePoster key={item.id} item={item} selected={selected === item.id} dragging={active === item.id} onTap={() => tap(item.id)} />)}
        </TierRow>)}
        <Watermark className={styles.screenWatermark} />
      </div>
      <Pool label={`${t.unranked} · ${t.count.replace('{count}', String(pool.length))}`} picking={selected !== null} onTap={() => tapTarget(null)}>
        {pool.map((item, index) => <DraggablePoster key={item.id} eager={index < FIRST_ROW} item={item} selected={selected === item.id} dragging={active === item.id} onTap={() => tap(item.id)} />)}
      </Pool>
      <DragOverlay dropAnimation={null}>{activeItem ? <div className={`${styles.poster} ${styles.overlay}`}><PosterImage item={activeItem} /></div> : null}</DragOverlay>
    </DndContext>
    {exporting && <div className={styles.offscreen} aria-hidden="true">
      <div ref={exportRef} className={`${styles.board} ${styles.exportBoard}`}>
        {board.tiers.map(tier => <div key={tier.id} className={styles.row}>
          <div className={styles.label} style={{ background: tier.color }}><span>{tier.label}</span></div>
          <div className={styles.items}>{board.rows[tier.id].map(id => byId.get(id)).filter((item): item is TierItem => Boolean(item)).map(item =>
            <div key={item.id} className={styles.poster}><PosterImage item={item} src={exporting.get(item.id)} eager /></div>)}</div>
        </div>)}
        <Watermark className={styles.watermark} />
      </div>
    </div>}
  </section>;
}

function Watermark({ className }: { className: string }) {
  return <div className={className} aria-hidden="true">Make Tier Lists on <strong>weeklyanime.com</strong></div>;
}

function TierRow({ tier, picking, onTap, onRename, editLabel, children }: {
  tier: Tier; picking: boolean; onTap: () => void; onRename: (value: string) => void; editLabel: string; children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `tier:${tier.id}` });
  return <div ref={setNodeRef} className={cx(styles.row, isOver && styles.over, picking && styles.picking)} data-tier={tier.id} onClick={onTap}>
    <div className={styles.label} style={{ background: tier.color }}>
      {/* While a poster is selected the label is a tap target, not a text field. */}
      <span key={tier.label} role={picking ? undefined : 'textbox'} aria-label={editLabel} contentEditable={!picking} suppressContentEditableWarning spellCheck={false}
        onBlur={event => { const value = event.currentTarget.textContent ?? ''; onRename(value); event.currentTarget.textContent = cleanLabel(value, tier.label); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}>{tier.label}</span>
    </div>
    <div className={styles.items}>{children}</div>
  </div>;
}

function Pool({ label, picking, onTap, children }: { label: string; picking: boolean; onTap: () => void; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL });
  return <div className={styles.poolWrap}>
    <h2 className={styles.poolTitle}>{label}</h2>
    <div ref={setNodeRef} className={cx(styles.pool, isOver && styles.over, picking && styles.picking)} data-tier={POOL} onClick={onTap}>{children}</div>
  </div>;
}

function DraggablePoster({ item, selected, dragging, eager = false, onTap }: { item: TierItem; selected: boolean; dragging: boolean; eager?: boolean; onTap: () => void }) {
  const drag = useDraggable({ id: itemKey(item.id) });
  const drop = useDroppable({ id: beforeKey(item.id) });
  const { setNodeRef: setDragRef } = drag; const { setNodeRef: setDropRef } = drop;
  const ref = useCallback((node: HTMLElement | null) => { setDragRef(node); setDropRef(node); }, [setDragRef, setDropRef]);
  return <button type="button" ref={ref} {...drag.listeners} {...drag.attributes} aria-pressed={selected} title={item.name}
    className={cx(styles.poster, selected && styles.selected, dragging && styles.dragging, drop.isOver && !dragging && styles.insert)} data-id={item.id}
    onClick={event => { event.stopPropagation(); onTap(); }}>
    <PosterImage item={item} eager={eager} />
  </button>;
}

function PosterImage({ item, src = item.poster, eager = false }: { item: TierItem; src?: string | null; eager?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <span className={styles.missing}>{item.name}</span>;
  // Posters load straight from TMDB/AniList: no image optimizer involved.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={item.name} width={120} height={180} draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(src)} />;
}
