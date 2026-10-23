import 'server-only';
import { getRuntimeCache } from '@/lib/runtime-cache';
import { tokenHash } from '@/lib/my-anime-auth';
// Namespace + hashed account keys keep these aggregates isolated from public
// catalog entries and other projects. No token is stored as a key or value.
export const personalCacheTag = (token: string) => `my-anime:${tokenHash(token)}`;
export const personalAggregates = getRuntimeCache({ namespace: 'anime-weekly-personal-v1', keyHashFunction: tokenHash });
