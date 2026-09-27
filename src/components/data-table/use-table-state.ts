'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { DEFAULT_PAGE_SIZE, mergeSearchParams, splitValues, type ParamPatch } from '@/lib/list-params';
import type { FilterDef, SortState, TableQueryPatch, TableQueryState } from './types';

/** URL keys a filter definition occupies. */
export function filterUrlKeys(def: FilterDef<never> | FilterDef<unknown>): string[] {
  return def.type === 'dateRange' ? [`${def.key}From`, `${def.key}To`] : [def.key];
}

function readState(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
  keys: string[],
  defaults: { pageSize: number; sort: SortState },
): TableQueryState {
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(params.get('pageSize') ?? '', 10) || defaults.pageSize));
  const sortId = params.get('sort');
  const dir = params.get('dir');
  const sort: SortState = sortId ? { id: sortId, desc: dir === 'desc' } : defaults.sort;
  const filters: Record<string, string[]> = {};
  for (const key of keys) {
    const values = splitValues(params.get(key));
    if (values.length) filters[key] = values;
  }
  return { page, pageSize, sort, q: params.get('q') ?? '', filters };
}

type ReadonlyURLSearchParamsLike = { get(name: string): string | null; toString(): string };

function patchToParams(patch: TableQueryPatch, defaults: { pageSize: number; sort: SortState }): ParamPatch {
  const out: ParamPatch = {};
  if (patch.page !== undefined) out.page = patch.page > 1 ? patch.page : null;
  if (patch.pageSize !== undefined) out.pageSize = patch.pageSize !== defaults.pageSize ? patch.pageSize : null;
  if (patch.sort !== undefined) {
    const isDefault =
      (patch.sort === null && defaults.sort === null) ||
      (patch.sort && defaults.sort && patch.sort.id === defaults.sort.id && patch.sort.desc === defaults.sort.desc);
    out.sort = patch.sort && !isDefault ? patch.sort.id : null;
    out.dir = patch.sort && !isDefault ? (patch.sort.desc ? 'desc' : 'asc') : null;
  }
  if (patch.q !== undefined) out.q = patch.q || null;
  if (patch.filters) for (const [k, v] of Object.entries(patch.filters)) out[k] = v && v.length ? v : null;
  return out;
}

export type TableStateApi = {
  state: TableQueryState;
  setState: (patch: TableQueryPatch) => void;
  /** Raw param setter for custom controls (server mode writes the URL). */
  setParams: (patch: ParamPatch) => void;
  isPending: boolean;
  /** Current query string without pagination (for exports). */
  queryString: string;
};

/**
 * Server mode: the URL is the source of truth. Changes call `router.replace` inside a
 * transition (no scroll jump) so the page re-renders with fresh server data while the
 * current rows stay visible (dimmed) — never a blank table.
 */
export function useUrlTableState(filters: FilterDef<never>[] | FilterDef<unknown>[], defaults: { pageSize?: number; sort?: SortState }): TableStateApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const d = useMemo(() => ({ pageSize: defaults.pageSize ?? DEFAULT_PAGE_SIZE, sort: defaults.sort ?? null }), [defaults.pageSize, defaults.sort]);
  const keys = useMemo(() => (filters as FilterDef<unknown>[]).flatMap((f) => filterUrlKeys(f)), [filters]);
  const state = useMemo(() => readState(searchParams, keys, d), [searchParams, keys, d]);

  const setParams = useCallback(
    (patch: ParamPatch) => {
      const next = mergeSearchParams(searchParams, patch);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  const setState = useCallback((patch: TableQueryPatch) => setParams(patchToParams(patch, d)), [setParams, d]);

  const queryString = useMemo(() => mergeSearchParams(searchParams, { page: null, pageSize: null }).toString(), [searchParams]);

  return { state, setState, setParams, isPending, queryString };
}

/** Client mode: same API backed by React state (small datasets fully loaded in the browser). */
export function useLocalTableState(defaults: { pageSize?: number; sort?: SortState }): TableStateApi {
  const [state, setLocal] = useState<TableQueryState>({
    page: 1,
    pageSize: defaults.pageSize ?? DEFAULT_PAGE_SIZE,
    sort: defaults.sort ?? null,
    q: '',
    filters: {},
  });

  const setState = useCallback((patch: TableQueryPatch) => {
    setLocal((prev) => {
      const filters = { ...prev.filters };
      if (patch.filters) {
        for (const [k, v] of Object.entries(patch.filters)) {
          if (v && v.length) filters[k] = v;
          else delete filters[k];
        }
      }
      const resetsPage = patch.page === undefined;
      return {
        page: patch.page ?? (resetsPage ? 1 : prev.page),
        pageSize: patch.pageSize ?? prev.pageSize,
        sort: patch.sort !== undefined ? patch.sort : prev.sort,
        q: patch.q ?? prev.q,
        filters,
      };
    });
  }, []);

  const setParams = useCallback(
    (patch: ParamPatch) => {
      const filters: Record<string, string[] | null> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (['page', 'pageSize', 'sort', 'dir', 'q'].includes(k)) continue;
        filters[k] = v === null || v === undefined || v === '' ? null : Array.isArray(v) ? [...v] : splitValues(String(v));
      }
      setState({ filters });
    },
    [setState],
  );

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.sort) {
      p.set('sort', state.sort.id);
      p.set('dir', state.sort.desc ? 'desc' : 'asc');
    }
    for (const [k, v] of Object.entries(state.filters)) p.set(k, v.join(','));
    return p.toString();
  }, [state]);

  return { state, setState, setParams, isPending: false, queryString };
}
