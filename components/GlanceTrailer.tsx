'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

export const TRAILER_HOVER_DELAY = 600;
export const TRAILER_PREVIEW_WIDTH = 384;
type Trailer = { preview: string; watch: string } | null;
const trailers = new Map<number, Promise<Trailer>>();

function loadTrailer(anilistId: number): Promise<Trailer> {
  let pending = trailers.get(anilistId);
  if (!pending) {
    pending = fetch(`/api/anime-trailer/${anilistId}`)
      .then(async response => {
        if (!response.ok) throw new Error('Trailer unavailable');
        const data = await response.json() as { preview?: string; watch?: string };
        return data.preview && data.watch ? { preview: data.preview, watch: data.watch } : null;
      })
      // A failed request is retried on a later hover; "no trailer" is remembered.
      .catch(() => { trailers.delete(anilistId); return null; });
    trailers.set(anilistId, pending);
  }
  return pending;
}

/** 16:9 box centred on the poster, kept inside the viewport. */
export function previewBox(poster: { left: number; top: number; width: number; height: number }, viewport: { width: number; height: number }, width = TRAILER_PREVIEW_WIDTH) {
  const w = Math.min(width, viewport.width - 16);
  const h = Math.round(w * 9 / 16);
  const clamp = (value: number, max: number) => Math.max(8, Math.min(value, max - 8));
  return { left: clamp(poster.left + poster.width / 2 - w / 2, viewport.width - w), top: clamp(poster.top + poster.height / 2 - h / 2, viewport.height - h), width: w, height: h };
}

/** Desktop hover preview: one at a time, after a short pause, muted. */
export function useTrailerHover() {
  const [active, setActive] = useState<{ key: string; title: string; preview: string; box: ReturnType<typeof previewBox> } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hovered = useRef<string | null>(null);
  const close = useCallback(() => { window.clearTimeout(timer.current); hovered.current = null; setActive(null); }, []);
  useEffect(() => {
    if (!active) return;
    // The box is fixed to the viewport: any scroll moves the poster away from it.
    window.addEventListener('scroll', close, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [active, close]);
  // Global timer API: this cleanup can also run outside a browser.
  useEffect(() => () => clearTimeout(timer.current), []);
  const bind = (key: string, anilistId: number | undefined, title: string) => {
    if (!anilistId) return {};
    return {
      onMouseEnter: (event: MouseEvent<HTMLElement>) => {
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const target = event.currentTarget;
        hovered.current = key;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          void loadTrailer(anilistId).then(trailer => {
            if (!trailer || hovered.current !== key || !target.isConnected) return;
            const rect = target.getBoundingClientRect();
            setActive({ key, title, preview: trailer.preview, box: previewBox(rect, { width: window.innerWidth, height: window.innerHeight }) });
          });
        }, TRAILER_HOVER_DELAY);
      },
      onMouseLeave: () => { if (hovered.current === key) close(); },
    };
  };
  const layer = active && typeof document !== 'undefined' ? createPortal(
    // pointer-events: none keeps the poster under the cursor hovered and clickable.
    <div className="week-glance-trailer" style={{ left: active.box.left, top: active.box.top, width: active.box.width, height: active.box.height }} aria-hidden="true">
      <iframe src={active.preview} title={active.title} tabIndex={-1} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
    </div>, document.body) : null;
  return { bind, layer, activeKey: active?.key ?? null };
}
