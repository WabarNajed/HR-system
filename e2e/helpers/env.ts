import fs from 'node:fs';
import path from 'node:path';

/**
 * Test environment. Values come from the process environment, falling back to `.env.local` / `.env`
 * in the repository root (tiny parser, no dependency). Only the local Supabase stack is supported:
 * the helpers refuse to talk to a non-local Supabase URL.
 */

function readDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    out[m[1]!] = value;
  }
  return out;
}

const root = path.resolve(__dirname, '..', '..');
const fileEnv = { ...readDotEnv(path.join(root, '.env')), ...readDotEnv(path.join(root, '.env.local')) };

export function env(name: string): string | undefined {
  return process.env[name] ?? fileEnv[name];
}

export const SUPABASE_URL = env('NEXT_PUBLIC_SUPABASE_URL') ?? 'http://localhost:54321';
export const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

export function assertLocalSupabase(): void {
  const host = new URL(SUPABASE_URL).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`E2E helpers only run against a local Supabase stack (got ${host}).`);
  }
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the E2E data helpers (.env.local).');
}
