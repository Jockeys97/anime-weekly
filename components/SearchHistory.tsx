'use client';
import { useEffect } from 'react';
import { installSearchHistory } from '@/lib/search-history';

export function SearchHistory() {
  useEffect(() => installSearchHistory(window), []);
  return null;
}
