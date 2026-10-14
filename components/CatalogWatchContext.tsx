'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PlatformSnapshot } from '@/lib/platform-data';

const CatalogWatchContext = createContext<PlatformSnapshot | null>(null);

export function CatalogWatchProvider({ snapshot, children }: { snapshot: PlatformSnapshot | null; children?: ReactNode }) {
  return <CatalogWatchContext.Provider value={snapshot}>{children}</CatalogWatchContext.Provider>;
}

export function useCatalogWatch(id: number) {
  const snapshot = useContext(CatalogWatchContext);
  const metadata = snapshot?.titles[`anilist:${id}`];
  // Provider links require the confirmed TMDB identity, not the AniList ID.
  return metadata && !metadata.providersUnavailable && metadata.match !== undefined ? metadata : undefined;
}
