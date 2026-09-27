# HR Portal — working rules

Read `docs/ARCHITECTURE.md` before changing anything; it is the binding contract (stack, folder layout,
data model, RLS matrix, RPC signatures, i18n, design tokens, routes).

Non-negotiables:
- Arabic-first bilingual UI. **No literal user-facing strings in components** — use `next-intl` with
  `locales/{ar,en}/<namespace>.json` (identical key sets; run `pnpm check:i18n`).
- Logical CSS only (`ms-/me-/ps-/pe-/start-/end-`), never `ml-/mr-/pl-/pr-/left-/right-` for layout.
- Schema changes only via new files in `supabase/migrations/`; regenerate `src/types/database.ts` with
  `pnpm db:types`. Never hand-edit generated types.
- Authorization lives in the database (RLS + `security definer` RPCs with explicit checks) **and** in
  server code (`requirePermission`). Never rely on hiding UI.
- Never leak raw DB/Auth errors to users — map through `src/lib/errors.ts` to i18n keys.
- No fake/demo data in the product UI. Empty data → compact `EmptyState`.
- Every control works or is disabled with a reason. Every async view has a skeleton; every mutation
  gives toast feedback.
- Secrets never in git. Service-role client only in server code after an explicit role check.
- Package manager: `pnpm`. Checks: `pnpm typecheck`, `pnpm lint`, `pnpm check:i18n`, `pnpm build`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
