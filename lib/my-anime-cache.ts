import 'server-only';
import { getCache } from '@vercel/functions';
import { tokenHash } from '@/lib/my-anime-auth';
// Namespace + hashed account keys keep these aggregates isolated from public
// catalog entries and other projects. No token is stored as a key or value.
export const personalCacheTag = (token: string) => `my-anime:${tokenHash(token)}`;
export const personalAggregates = getCache({ namespace: 'anime-weekly-personal-v1', keyHashFunction: tokenHash });
