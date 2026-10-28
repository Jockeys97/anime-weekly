import type { Metadata } from 'next';
// A failed regeneration must reject: ISR retains the last successful HTML/RSC.
export async function softLookup<T>(work: () => Promise<T>, context: Record<string, unknown>): Promise<T> {
  try { return await work(); }
  catch (error) {
    console.warn('[anime-detail] transient lookup failure', { ...context, message: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

// Clear inherited homepage social metadata and canonical links.
export function softFailureMetadata(_title?: string): Metadata {
  return {
    title: { absolute: 'Temporarily unavailable · Weekly Anime' },
    robots: { index: false, follow: true }, alternates: null,
    openGraph: { title: 'Temporarily unavailable · Weekly Anime', description: 'Please try again shortly.' },
    twitter: { card: 'summary', title: 'Temporarily unavailable · Weekly Anime', description: 'Please try again shortly.', images: [] },
  };
}
