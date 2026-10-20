'use client';

// Cards share observers instead of constructing one per enrichment section.
const groups = new Map<string, { observer: IntersectionObserver; callbacks: Map<Element, () => void> }>();

export function observeNearViewport(target: Element, callback: () => void, rootMargin = '100px'): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  let group = groups.get(rootMargin);
  if (!group) {
    const callbacks = new Map<Element, () => void>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const run = callbacks.get(entry.target);
        callbacks.delete(entry.target);
        observer.unobserve(entry.target);
        run?.();
      }
      if (!callbacks.size) {
        observer.disconnect();
        if (groups.get(rootMargin)?.observer === observer) groups.delete(rootMargin);
      }
    }, { rootMargin });
    group = { observer, callbacks };
    groups.set(rootMargin, group);
  }
  const current = group;
  current.callbacks.set(target, callback);
  current.observer.observe(target);
  return () => {
    current.callbacks.delete(target);
    current.observer.unobserve(target);
    if (!current.callbacks.size) {
      current.observer.disconnect();
      if (groups.get(rootMargin) === current) groups.delete(rootMargin);
    }
  };
}
