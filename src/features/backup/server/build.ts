import 'server-only';

import type { SessionContext } from '@/lib/auth/session';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { BACKUP_FORMAT, BACKUP_VERSION, backupTablesFor, type BackupTable } from '../lib/entities';

type Row = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

/** Reads a whole table with the user's RLS client, 1,000 rows per request. */
async function readTable(client: LooseClient, t: BackupTable): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 1_000_000; from += 1000) {
    const { data, error } = await client.from(t.table).select('*').order(t.order).range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function cellValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

async function toXlsx(table: string, rows: Row[]): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HR Portal backup';
  wb.created = new Date();
  const ws = wb.addWorksheet(table.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  const columns = Array.from(rows.reduce((set, r) => {
    for (const k of Object.keys(r)) set.add(k);
    return set;
  }, new Set<string>()));
  ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 2)) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const values: Record<string, unknown> = {};
    for (const c of columns) values[c] = cellValue(r[c]);
    ws.addRow(values);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export type BackupManifest = {
  format: string;
  version: number;
  generated_at: string;
  generated_by: { id: string; email: string | null; name: string | null };
  organization: { name_ar: string | null; name_en: string | null };
  includes_sensitive: boolean;
  tables: Array<{ table: string; group: string; rows: number; json: string; xlsx: string }>;
  counts: Record<string, number>;
  total_rows: number;
  notes: string[];
};

/**
 * Builds the backup ZIP (manifest + JSON + XLSX per table) and returns it as a web stream.
 * Data is read as the signed-in user (RLS); salary and bank tables only for a super admin.
 */
export async function buildBackup(client: ServerSupabaseClient, ctx: SessionContext): Promise<{ stream: ReadableStream<Uint8Array>; manifest: BackupManifest }> {
  const JSZip = (await import('jszip')).default;
  const includeSensitive = ctx.isSuperAdmin;
  const tables = backupTablesFor(includeSensitive);
  const loose = client as unknown as LooseClient;

  const data = await Promise.all(tables.map(async (t) => ({ t, rows: await readTable(loose, t) })));
  const org = (data.find((d) => d.t.table === 'organizations')?.rows[0] ?? {}) as { name_ar?: string | null; name_en?: string | null };

  const zip = new JSZip();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    generated_at: new Date().toISOString(),
    generated_by: { id: ctx.user.id, email: ctx.user.email, name: ctx.profile.fullName },
    organization: { name_ar: org.name_ar ?? null, name_en: org.name_en ?? null },
    includes_sensitive: includeSensitive,
    tables: [],
    counts: {},
    total_rows: 0,
    notes: [
      'Each table is exported as json/<table>.json (array of rows, raw column names) and xlsx/<table>.xlsx.',
      'Uploaded files (documents, attachments, certificate PDFs, branding) are not included — only their metadata.',
      includeSensitive ? 'Salary and bank tables are included.' : 'Salary and bank tables are excluded (super admin only).',
    ],
  };
  for (const { t, rows } of data) {
    const json = `json/${t.table}.json`;
    const xlsx = `xlsx/${t.table}.xlsx`;
    zip.file(json, JSON.stringify(rows, null, 2));
    zip.file(xlsx, await toXlsx(t.table, rows));
    manifest.tables.push({ table: t.table, group: t.group, rows: rows.length, json, xlsx });
    manifest.counts[t.table] = rows.length;
    manifest.total_rows += rows.length;
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const nodeStream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (error: Error) => controller.error(error));
    },
    cancel() {
      (nodeStream as unknown as { pause?: () => void }).pause?.();
    },
  });
  return { stream, manifest };
}
