'use server';

import { z } from 'zod';
import { ok, withAction } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';

/**
 * Global search (header ⌘K) via RPC `public.global_search(p_query)` — security invoker, so RLS
 * limits results to what the user may see (employees by name/ID/Iqama, requests, certificates).
 */

export type SearchResult = {
  kind: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

const schema = z.object({ query: z.string().trim().min(2, 'validation.required').max(100, 'validation.maxLength|{"max":100}') });

type Row = { kind: string | null; id: string | null; title: string | null; subtitle: string | null; href: string | null };

export const globalSearch = withAction(
  schema,
  async ({ query }, { ctx }) => {
    const supabase = await createClient({ timeoutMs: 6000 });
    const { data, error } = await supabase.rpc('global_search', { p_query: query, p_locale: ctx.locale, p_limit: 10 });
    if (error) throw error;
    const rows = ((data ?? []) as Row[])
      .filter((r) => r.id && r.title && r.href && r.href.startsWith('/'))
      .slice(0, 30)
      .map<SearchResult>((r) => ({ kind: r.kind ?? 'other', id: String(r.id), title: r.title!, subtitle: r.subtitle ?? null, href: r.href! }));
    return ok(rows);
  },
  { scope: 'search.global' },
);
