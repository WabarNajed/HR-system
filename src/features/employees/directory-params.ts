/**
 * Directory URL contract — shared by the `/employees` page, the DataTable filters and the
 * `employees` / `dependents` / `insurance` export datasets, so exports honour exactly the same
 * search, filters and sorting as the list.
 *
 *   ?q=&department=<uuid,…>&status=active,probation&manager=<uuid>&location=<uuid>
 *   &nationality=Saudi&jobTitle=<uuid>&employmentType=full_time&gender=female
 *   &iqama=within30&portal=with|without&archived=include|only&sort=name&dir=asc
 */
import type { ListParamsOptions } from '@/lib/list-params';
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, GENDERS, IQAMA_FILTER_BUCKETS } from './types';

export const DIRECTORY_FILTER_KEYS = [
  'department',
  'status',
  'manager',
  'location',
  'nationality',
  'jobTitle',
  'employmentType',
  'gender',
  'iqama',
  'portal',
  'archived',
] as const;
export type DirectoryFilterKey = (typeof DIRECTORY_FILTER_KEYS)[number];

export const DIRECTORY_SORTS = ['name', 'employee_number', 'employment_status', 'iqama_expiry_date', 'joining_date'] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export const DIRECTORY_LIST_OPTIONS: ListParamsOptions<DirectorySort, DirectoryFilterKey> = {
  defaultSort: 'name',
  defaultDir: 'asc',
  allowedSorts: DIRECTORY_SORTS,
  filterKeys: DIRECTORY_FILTER_KEYS,
  defaultPageSize: 25,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_RE.test(value);

/** Keeps only whitelisted values of a filter (never trust the URL). */
export function sanitizeFilter(key: DirectoryFilterKey, values: readonly string[] | undefined): string[] {
  if (!values?.length) return [];
  switch (key) {
    case 'department':
    case 'manager':
    case 'location':
    case 'jobTitle':
      return values.filter(isUuid).slice(0, 50);
    case 'status':
      return values.filter((v) => (EMPLOYMENT_STATUSES as readonly string[]).includes(v));
    case 'employmentType':
      return values.filter((v) => (EMPLOYMENT_TYPES as readonly string[]).includes(v));
    case 'gender':
      return values.filter((v) => (GENDERS as readonly string[]).includes(v));
    case 'iqama':
      return values.filter((v) => (IQAMA_FILTER_BUCKETS as readonly string[]).includes(v)).slice(0, 1);
    case 'portal':
      return values.filter((v) => v === 'with' || v === 'without').slice(0, 1);
    case 'archived':
      return values.filter((v) => v === 'include' || v === 'only').slice(0, 1);
    case 'nationality':
      return values.map((v) => v.slice(0, 100)).slice(0, 30);
    default:
      return [];
  }
}

/**
 * Same folding as `private.normalize_search` (DB): strips Arabic diacritics/tatweel, folds
 * أإآٱ→ا, ى→ي, ة→ه, ؤ→و, ئ→ي and lower-cases — so "احمد" finds "أحمد".
 */
export function normalizeSearch(value: string): string {
  const map: Record<string, string> = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ئ': 'ي' };
  return value
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱىةؤئ]/g, (c) => map[c] ?? c)
    .toLowerCase();
}
