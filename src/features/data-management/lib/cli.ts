/**
 * Helpers for the Node CLIs (`pnpm analyze:workbook`, `pnpm import:employees`). Never imported by
 * the app: reads `.env.local` and creates a service-role client.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { DbClient } from './context';

export function loadEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

/** process.env over `.env.local` over `.env` (repository root). */
export function cliEnv(root = process.cwd()): Record<string, string | undefined> {
  return { ...loadEnvFile(resolve(root, '.env')), ...loadEnvFile(resolve(root, '.env.local')), ...process.env };
}

export function serviceClient(env: Record<string, string | undefined>): { client: DbClient; url: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local or environment).');
  }
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { client, url };
}

export type CliArgs = { positional: string[]; flags: Record<string, string | true> };

export function parseArgs(argv: readonly string[]): CliArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) flags[k] = argv[++i]!;
      else flags[k] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

/** Pads text for terminal columns (Arabic is shown as-is; widths are approximate). */
export function pad(value: unknown, width: number): string {
  const s = value === null || value === undefined ? '' : String(value);
  const clipped = s.length > width ? `${s.slice(0, width - 1)}…` : s;
  return clipped + ' '.repeat(Math.max(0, width - clipped.length));
}

export const color = {
  bold: (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  red: (s: string) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s: string) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s),
};
