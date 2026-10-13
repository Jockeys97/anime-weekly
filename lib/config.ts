export const STREAMING_REGIONS = ['IT', 'US', 'GB', 'FR', 'DE', 'JP'] as const;
export type StreamingRegion = typeof STREAMING_REGIONS[number];
export const MAX_TITLES_PER_WEEK = 40;
export const CACHE_SECONDS = 604800;
export const CACHE_TAG = 'anime-week';
