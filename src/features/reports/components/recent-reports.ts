'use client';

import { useSyncExternalStore } from 'react';

/**
 * "Recently viewed" reports — a per-viewer convenience kept in localStorage (never required:
 * private windows / blocked storage simply show nothing).
 */

const STORAGE_KEY = 'reports:recent';
const MAX = 6;
const listeners = new Set<() => void>();
let cache: { raw: string | null; keys: string[] } = { raw: null, keys: [] };

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cache.raw) return cache.keys;
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const keys = Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string').slice(0, MAX) : [];
    cache = { raw, keys };
    return keys;
  } catch {
    return cache.keys;
  }
}

function write(keys: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(0, MAX)));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function rememberReport(key: string) {
  write([key, ...read().filter((k) => k !== key)]);
}

export function clearRecentReports() {
  write([]);
}

const EMPTY: string[] = [];

export function useRecentReports(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    read,
    () => EMPTY,
  );
}
