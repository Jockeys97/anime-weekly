export const STREAMING_REGIONS = ['IT', 'US', 'GB', 'FR', 'DE', 'JP', 'ES', 'PT', 'CA', 'AU', 'NZ', 'IE', 'AT', 'CH', 'BE', 'NL', 'PL', 'CZ', 'HU', 'RO', 'GR', 'DK', 'SE', 'NO', 'FI', 'BR', 'MX', 'AR', 'CL', 'CO', 'IN', 'KR', 'TW', 'HK', 'SG', 'ZA'] as const;
export type StreamingRegion = typeof STREAMING_REGIONS[number];
export const MAX_TITLES_PER_WEEK = 40;
export const CACHE_SECONDS = 604800;
export const CACHE_TAG = 'anime-week';
