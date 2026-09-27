/**
 * URL-driven list state shared by server pages (parse → Supabase `.range()/.order()`) and the
 * client DataTable (read/write via router.replace). Keep both sides on these helpers so the URL
 * format is identical everywhere:
 *
 *   ?page=2&pageSize=25&sort=joining_date&dir=desc&q=ahmed&status=active,probation&createdFrom=2026-01-01
 *
 * - `page` is 1-based.
 * - Multi-value filters are comma-separated in a single key.
 * - Date ranges use `<key>From` / `<key>To` keys with ISO `yyyy-MM-dd` values.
 */

export type SortDir = 'asc' | 'desc';

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Reserved keys that are never treated as filters. */
export const LIST_PARAM_KEYS = ['page', 'pageSize', 'sort', 'dir', 'q'] as const;

export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | ReadonlyURLSearchParamsLike
  | null
  | undefined;

/** Structural type for Next's ReadonlyURLSearchParams. */
export type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
  getAll(name: string): string[];
  keys(): Iterable<string>;
};

export interface ListParamsOptions<S extends string = string, F extends string = string> {
  /** Column used when `sort` is missing or not allowed. */
  defaultSort?: S;
  defaultDir?: SortDir;
  /** Whitelist of sortable columns — anything else falls back to `defaultSort` (prevents SQL/PostgREST abuse). */
  allowedSorts?: readonly S[];
  /** Keys read as filters (e.g. `['status', 'department', 'createdFrom', 'createdTo']`). */
  filterKeys?: readonly F[];
  defaultPageSize?: number;
  maxPageSize?: number;
  /** Max length of the free-text query (default 100). */
  maxQueryLength?: number;
}

export interface ListParams<S extends string = string, F extends string = string> {
  page: number;
  pageSize: number;
  /** Inclusive row offsets for Supabase `.range(from, to)`. */
  from: number;
  to: number;
  q: string;
  sort: S | null;
  dir: SortDir;
  /** Filter values (comma-split, trimmed, de-duplicated). Missing keys are absent. */
  filters: Partial<Record<F, string[]>>;
}

function readParam(input: SearchParamsInput, key: string): string | undefined {
  if (!input) return undefined;
  if (typeof (input as URLSearchParams).get === 'function') {
    return (input as URLSearchParams).get(key) ?? undefined;
  }
  const raw = (input as Record<string, string | string[] | undefined>)[key];
  if (Array.isArray(raw)) return raw.join(',');
  return raw ?? undefined;
}

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function splitValues(value: string | undefined | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
}

/** Parses page/pageSize/sort/dir/q and whitelisted filters from search params. */
export function parseListParams<S extends string = string, F extends string = string>(
  searchParams: SearchParamsInput,
  options: ListParamsOptions<S, F> = {},
): ListParams<S, F> {
  const {
    defaultSort,
    defaultDir = 'asc',
    allowedSorts,
    filterKeys = [],
    defaultPageSize = DEFAULT_PAGE_SIZE,
    maxPageSize = MAX_PAGE_SIZE,
    maxQueryLength = 100,
  } = options;

  const page = Math.min(toInt(readParam(searchParams, 'page'), 1), 100_000);
  const pageSize = Math.min(toInt(readParam(searchParams, 'pageSize'), defaultPageSize), maxPageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const q = (readParam(searchParams, 'q') ?? '').trim().slice(0, maxQueryLength);

  const rawSort = readParam(searchParams, 'sort') as S | undefined;
  const sortAllowed = rawSort && (!allowedSorts || allowedSorts.includes(rawSort));
  const sort = (sortAllowed ? rawSort : defaultSort) ?? null;
  const rawDir = readParam(searchParams, 'dir');
  const dir: SortDir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : defaultDir;

  const filters: Partial<Record<F, string[]>> = {};
  for (const key of filterKeys) {
    const values = splitValues(readParam(searchParams, key));
    if (values.length) filters[key] = values;
  }

  return { page, pageSize, from, to, q, sort, dir, filters };
}

/** First value of a filter, or undefined. */
export function firstFilter<F extends string>(filters: Partial<Record<F, string[]>>, key: F): string | undefined {
  return filters[key]?.[0];
}

/** Escapes a user query for PostgREST `ilike` patterns (`%`, `_`, `,`, `(`, `)` are special). */
export function toIlikePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`).replace(/[,()]/g, ' ');
  return `%${escaped}%`;
}

/** Page count helper. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

export type ParamPatch = Record<string, string | number | readonly string[] | null | undefined>;

/**
 * Returns a new URLSearchParams with `patch` applied: `null`/`undefined`/`''`/`[]` delete the key,
 * arrays are comma-joined. Unless the patch touches `page`, any change resets `page` (filters or
 * sorting changed → back to page 1).
 */
export function mergeSearchParams(current: SearchParamsInput, patch: ParamPatch): URLSearchParams {
  const next = new URLSearchParams();
  if (current) {
    if (typeof (current as URLSearchParams).forEach === 'function') {
      (current as URLSearchParams).forEach((v, k) => next.append(k, v));
    } else if (typeof (current as ReadonlyURLSearchParamsLike).keys === 'function') {
      const c = current as ReadonlyURLSearchParamsLike;
      for (const k of Array.from(c.keys())) for (const v of c.getAll(k)) next.append(k, v);
    } else {
      for (const [k, v] of Object.entries(current as Record<string, string | string[] | undefined>)) {
        if (v === undefined) continue;
        next.set(k, Array.isArray(v) ? v.join(',') : v);
      }
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      next.delete(key);
    } else {
      next.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
  if (!('page' in patch)) next.delete('page');
  return next;
}

/** Serializes list state to search params, omitting defaults to keep URLs short. */
export function toSearchParams<S extends string, F extends string>(
  params: Partial<Omit<ListParams<S, F>, 'from' | 'to'>>,
  defaults: { pageSize?: number; sort?: S | null; dir?: SortDir } = {},
): URLSearchParams {
  const out = new URLSearchParams();
  if (params.page && params.page > 1) out.set('page', String(params.page));
  if (params.pageSize && params.pageSize !== (defaults.pageSize ?? DEFAULT_PAGE_SIZE)) {
    out.set('pageSize', String(params.pageSize));
  }
  if (params.sort && params.sort !== defaults.sort) out.set('sort', params.sort);
  if (params.sort && params.dir && (params.sort !== defaults.sort || params.dir !== (defaults.dir ?? 'asc'))) {
    out.set('dir', params.dir);
  }
  if (params.q) out.set('q', params.q);
  if (params.filters) {
    for (const [key, values] of Object.entries(params.filters) as [string, string[] | undefined][]) {
      if (values?.length) out.set(key, values.join(','));
    }
  }
  return out;
}

/** Search params without pagination — for export links that must apply the current filters. */
export function exportSearchParams(current: SearchParamsInput): URLSearchParams {
  const next = mergeSearchParams(current, { page: null, pageSize: null });
  return next;
}
