interface SearchPosition { url: string; y: number; anime: string; offset: number; savedAt: number }
const KEY = 'weekly-anime:search-history:v1';
const MAX_AGE = 30 * 60 * 1000;
const isSearch = (path: string) => /^\/(?:en\/|it\/|es\/|fr\/|de\/|pt\/)?search\/?$/.test(path);

/** Keep only navigation coordinates, never HTML or user/account data. */
export function installSearchHistory(win: Window): () => void {
  const doc = win.document;
  const positions = new Map<string, SearchPosition>();
  let stopRestore = () => {};
  try {
    const saved: SearchPosition[] = JSON.parse(win.sessionStorage.getItem(KEY) || '[]');
    if (Array.isArray(saved)) for (const point of saved.slice(-10)) {
      if (typeof point.url === 'string' && typeof point.anime === 'string' && /^\d+$/.test(point.anime)
        && Number.isFinite(point.y) && point.y >= 0 && Number.isFinite(point.offset)
        && Number.isFinite(point.savedAt) && Date.now() - point.savedAt < MAX_AGE) positions.set(point.url, point);
    }
  } catch { /* Storage can be disabled; in-memory back navigation still works. */ }
  const url = () => win.location.pathname + win.location.search;
  const save = (event: MouseEvent) => {
    stopRestore();
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !isSearch(win.location.pathname)) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!target || target.target === '_blank') return;
    const destination = new URL(target.href, win.location.href);
    if (destination.origin !== win.location.origin || !/^\/(?:en\/|it\/|es\/|fr\/|de\/|pt\/)?anime\//.test(destination.pathname)) return;
    const card = target.closest<HTMLElement>('[data-search-anime]');
    if (!card?.dataset.searchAnime) return;
    positions.delete(url());
    positions.set(url(), { url: url(), y: win.scrollY, anime: card.dataset.searchAnime, offset: card.getBoundingClientRect().top, savedAt: Date.now() });
    while (positions.size > 10) positions.delete(positions.keys().next().value!);
    try { win.sessionStorage.setItem(KEY, JSON.stringify([...positions.values()])); } catch { /* Optional storage. */ }
  };
  const restore = () => {
    stopRestore();
    if (!isSearch(win.location.pathname)) return;
    const point = positions.get(url());
    if (!point || Date.now() - point.savedAt >= MAX_AGE) return;
    let frame = 0;
    let stopped = false;
    // The router can restore the route before streamed cards and ratings arrive.
    // Follow the original card until layout settles or the user resumes control.
    const apply = () => {
      frame = 0;
      if (stopped || url() !== point.url) return;
      const card = doc.querySelector<HTMLElement>(`.explore-page [data-search-anime="${point.anime}"]`);
      if (!card || !card.getClientRects().length) return;
      const y = Math.max(0, win.scrollY + card.getBoundingClientRect().top - point.offset);
      win.scrollTo({ top: y, behavior: 'instant' });
    };
    const queue = () => { if (!frame && !stopped) frame = win.requestAnimationFrame(apply); };
    const mutations = new MutationObserver(queue);
    const resize = new ResizeObserver(queue);
    mutations.observe(doc.body, { childList: true, subtree: true });
    resize.observe(doc.body);
    const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stop = () => {
      stopped = true; mutations.disconnect(); resize.disconnect();
      win.cancelAnimationFrame(frame); win.clearTimeout(timer);
      for (const type of inputs) win.removeEventListener(type, stop);
    };
    const timer = win.setTimeout(stop, 8000);
    for (const type of inputs) win.addEventListener(type, stop, { passive: true });
    stopRestore = stop;
    queue();
  };
  const pageshow = (event: PageTransitionEvent) => {
    if (event.persisted || win.performance.getEntriesByType('navigation').some(entry => (entry as PerformanceNavigationTiming).type === 'back_forward')) restore();
  };
  // Capture the source coordinates before Next changes the route or scrolls.
  doc.addEventListener('click', save, true);
  win.addEventListener('popstate', restore);
  win.addEventListener('pageshow', pageshow);
  // A full browser-history load may hydrate after pageshow has already fired.
  if (win.performance.getEntriesByType('navigation').some(entry => (entry as PerformanceNavigationTiming).type === 'back_forward')) restore();
  return () => { stopRestore(); doc.removeEventListener('click', save, true); win.removeEventListener('popstate', restore); win.removeEventListener('pageshow', pageshow); };
}
