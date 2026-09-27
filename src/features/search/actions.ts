'use server';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { ok, withAction } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';

/**
 * Global search (header ⌘K) via RPC `public.global_search(p_query, p_locale, p_limit)` — security
 * invoker, so RLS limits results to what the user may see: employees by name (Arabic folding) /
 * number / company e-mail, Iqama number only with org `personal_data.view`, requests by number,
 * certificates by number. An employee therefore only ever finds their own records.
 */

export type SearchResultKind = 'employee' | 'request' | 'certificate' | 'other';

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

const schema = z.object({ query: z.string().trim().min(2, 'validation.required').max(100, 'validation.maxLength|{"max":100}') });

type Row = { kind: string | null; id: string | null; title: string | null; subtitle: string | null; href: string | null };

const KINDS: readonly SearchResultKind[] = ['employee', 'request', 'certificate'];

export const globalSearch = withAction(
  schema,
  async ({ query }, { ctx }) => {
    const supabase = await createClient({ timeoutMs: 6000 });
    const [{ data, error }, tCert] = await Promise.all([
      supabase.rpc('global_search', { p_query: query, p_locale: ctx.locale, p_limit: 8 }),
      getTranslations({ locale: ctx.locale, namespace: 'enums.certificateType' }),
    ]);
    if (error) throw error;
    const tc = tCert as unknown as { has: (k: string) => boolean; (k: string): string };
    const rows = ((data ?? []) as Row[])
      .filter((r) => r.id && r.title && r.href && r.href.startsWith('/') && !r.href.startsWith('//'))
      .slice(0, 30)
      .map<SearchResult>((r) => {
        const kind = (KINDS as readonly string[]).includes(r.kind ?? '') ? (r.kind as SearchResultKind) : 'other';
        let subtitle = r.subtitle ?? null;
        // Certificates come back as "<employee> · <certificate_type key>" — translate the type.
        if (kind === 'certificate' && subtitle) {
          const parts = subtitle.split(' · ');
          const last = parts[parts.length - 1] ?? '';
          if (tc.has(last)) parts[parts.length - 1] = tc(last);
          subtitle = parts.join(' · ');
        }
        return { kind, id: String(r.id), title: r.title!, subtitle, href: r.href! };
      });
    return ok(rows);
  },
  { scope: 'search.global' },
);
