#!/usr/bin/env node
/**
 * Generates src/types/database.ts from the live database schema (schema `public`), in the same shape as
 * `supabase gen types typescript` (Database → public → Tables {Row, Insert, Update, Relationships},
 * Views, Functions {Args, Returns}, Enums, CompositeTypes + Tables<> / TablesInsert<> / TablesUpdate<> /
 * Enums<> / CompositeTypes<> helpers and __InternalSupabase.PostgrestVersion).
 *
 * Dependency-free: introspects with `psql -At` (json_agg queries).
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres node scripts/gen-db-types.mjs [--out path] [--check]
 *
 * DATABASE_URL falls back to .env.local, then to the local Supabase default. --check exits 1 when the
 * file on disk differs from what the schema produces (CI drift check) instead of writing it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'public';
const POSTGREST_VERSION = '13';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = resolve(ROOT, '.env.local');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  return 'postgresql://postgres:postgres@localhost:54322/postgres';
}

function query(sql) {
  try {
    const out = execFileSync('psql', [databaseUrl(), '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out.trim() || 'null') ?? [];
  } catch (err) {
    const detail = err.stderr?.toString() || err.message;
    console.error(`gen-db-types: query failed — is the database running and psql installed?\n${detail}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------------------------------
const relations = query(`
  select coalesce(json_agg(r order by r.name), '[]'::json) from (
    select
      c.relname as name,
      c.relkind as kind,
      (select coalesce(json_agg(json_build_object(
          'name', a.attname,
          'type', t.typname,
          'typtype', t.typtype,
          'elem', et.typname,
          'elemtyptype', et.typtype,
          'nullable', not a.attnotnull,
          'hasDefault', a.atthasdef,
          'identity', a.attidentity,
          'generated', a.attgenerated
        ) order by a.attname), '[]'::json)
       from pg_attribute a
       join pg_type t on t.oid = a.atttypid
       left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
       where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns,
      (select coalesce(json_agg(json_build_object(
          'foreignKeyName', con.conname,
          'columns', (select json_agg(att.attname order by k.ord)
                      from unnest(con.conkey) with ordinality as k(attnum, ord)
                      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum),
          'isOneToOne', exists (
              select 1 from pg_index i
              where i.indrelid = con.conrelid and i.indisunique and i.indpred is null
                and (i.indkey::int2[])::int[] @> con.conkey::int[] and (i.indkey::int2[])::int[] <@ con.conkey::int[]
                and i.indnkeyatts = cardinality(con.conkey)),
          'referencedSchema', rn.nspname,
          'referencedRelation', rc.relname,
          'referencedColumns', (select json_agg(att.attname order by k.ord)
                                from unnest(con.confkey) with ordinality as k(attnum, ord)
                                join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.attnum)
        ) order by con.conname, rc.relname), '[]'::json)
       from pg_constraint con
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
       where con.contype = 'f' and con.conrelid = c.oid) as relationships
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${SCHEMA}' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  ) r`);

const functions = query(`
  select coalesce(json_agg(f order by f.name, f.identity_args), '[]'::json) from (
    select
      p.proname as name,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      p.proretset as returns_set,
      rt.typname as return_type,
      rt.typtype as return_typtype,
      ret.typname as return_elem,
      rt.typrelid as return_relid,
      (select c.relname from pg_class c where c.oid = rt.typrelid) as return_relation,
      p.pronargs as nargs,
      p.pronargdefaults as nargdefaults,
      coalesce(p.proargmodes::text[], array_fill('i'::text, array[coalesce(array_length(p.proallargtypes, 1), p.pronargs)])) as modes,
      coalesce(p.proargnames, array[]::text[]) as arg_names,
      (select json_agg(json_build_object('type', t.typname, 'typtype', t.typtype, 'elem', et.typname) order by x.ord)
       from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as x(oid, ord)
       join pg_type t on t.oid = x.oid
       left join pg_type et on et.oid = t.typelem and t.typcategory = 'A') as arg_types
    from pg_proc p
    join pg_type rt on rt.oid = p.prorettype
    left join pg_type ret on ret.oid = rt.typelem and rt.typcategory = 'A'
    where p.pronamespace = '${SCHEMA}'::regnamespace
      and p.prokind = 'f'
      and rt.typname not in ('trigger', 'event_trigger')
      and not exists (select 1 from unnest(p.proargtypes::oid[]) as a(oid) join pg_type t on t.oid = a.oid
                      where t.typname in ('internal', 'trigger', 'event_trigger'))
  ) f`);

const enums = query(`
  select coalesce(json_agg(e order by e.name), '[]'::json) from (
    select t.typname as name, json_agg(en.enumlabel order by en.enumsortorder) as values
    from pg_type t join pg_enum en on en.enumtypid = t.oid
    where t.typnamespace = '${SCHEMA}'::regnamespace
    group by t.typname
  ) e`);

const composites = query(`
  select coalesce(json_agg(ct order by ct.name), '[]'::json) from (
    select t.typname as name,
      (select json_agg(json_build_object('name', a.attname, 'type', at.typname, 'typtype', at.typtype, 'elem', aet.typname)
                       order by a.attnum)
       from pg_attribute a join pg_type at on at.oid = a.atttypid
       left join pg_type aet on aet.oid = at.typelem and at.typcategory = 'A'
       where a.attrelid = t.typrelid and a.attnum > 0 and not a.attisdropped) as attributes
    from pg_type t join pg_class c on c.oid = t.typrelid
    where t.typnamespace = '${SCHEMA}'::regnamespace and t.typtype = 'c' and c.relkind = 'c'
  ) ct`);

// ---------------------------------------------------------------------------------------------------
// Type mapping (mirrors postgres-meta's typegen)
// ---------------------------------------------------------------------------------------------------
const enumNames = new Set(enums.map((e) => e.name));
const compositeNames = new Set(composites.map((c) => c.name));
const relationByName = new Map(relations.map((r) => [r.name, r]));

function scalarTs(typname, typtype) {
  switch (typname) {
    case 'bool':
      return 'boolean';
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
    case 'oid':
      return 'number';
    case 'json':
    case 'jsonb':
      return 'Json';
    case 'void':
      return 'undefined';
    case 'record':
      return 'Record<string, unknown>';
    case 'text':
    case 'varchar':
    case 'bpchar':
    case 'char':
    case 'name':
    case 'citext':
    case 'uuid':
    case 'date':
    case 'time':
    case 'timetz':
    case 'timestamp':
    case 'timestamptz':
    case 'interval':
    case 'bytea':
    case 'inet':
    case 'cidr':
    case 'macaddr':
    case 'money':
    case 'tsvector':
    case 'tsquery':
    case 'regclass':
    case 'xml':
      return 'string';
    default:
      if (typtype === 'e' && enumNames.has(typname)) return `Database["${SCHEMA}"]["Enums"]["${typname}"]`;
      if (typtype === 'c' && compositeNames.has(typname)) return `Database["${SCHEMA}"]["CompositeTypes"]["${typname}"]`;
      if (typtype === 'd') return 'string';
      return 'unknown';
  }
}

function tsType(col) {
  if (col.elem) return `${scalarTs(col.elem, col.elemtyptype)}[]`;
  if (col.type && col.type.startsWith('_')) return `${scalarTs(col.type.slice(1))}[]`;
  return scalarTs(col.type, col.typtype);
}

const ident = (name) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name));
const pad = (n) => ' '.repeat(n);

function objectLines(entries, indent) {
  // entries: [key, value] with value already a string
  return entries.map(([k, v]) => `${pad(indent)}${k}: ${v}`).join('\n');
}

function renderTable(rel, indent) {
  const isView = rel.kind === 'v' || rel.kind === 'm';
  const cols = rel.columns;
  const row = cols.map((c) => [ident(c.name), `${tsType(c)}${c.nullable || isView ? ' | null' : ''}`]);
  const writeCols = (mode) =>
    cols.map((c) => {
      const t = `${tsType(c)}${c.nullable || isView ? ' | null' : ''}`;
      if (c.generated === 's' || c.identity === 'a') return [`${ident(c.name)}?`, 'never'];
      const optional = mode === 'update' || c.nullable || c.hasDefault || c.identity === 'd' || isView;
      return [`${ident(c.name)}${optional ? '?' : ''}`, t];
    });
  const rels = rel.relationships.filter((r) => r.referencedSchema === SCHEMA);
  const relLines = rels.length
    ? `[\n${rels
        .map(
          (r) =>
            `${pad(indent + 2)}{\n` +
            `${pad(indent + 4)}foreignKeyName: ${JSON.stringify(r.foreignKeyName)}\n` +
            `${pad(indent + 4)}columns: [${r.columns.map((c) => JSON.stringify(c)).join(', ')}]\n` +
            `${pad(indent + 4)}isOneToOne: ${r.isOneToOne}\n` +
            `${pad(indent + 4)}referencedRelation: ${JSON.stringify(r.referencedRelation)}\n` +
            `${pad(indent + 4)}referencedColumns: [${r.referencedColumns.map((c) => JSON.stringify(c)).join(', ')}]\n` +
            `${pad(indent + 2)}},`,
        )
        .join('\n')}\n${pad(indent)}]`
    : '[]';
  const block = (name, entries) =>
    `${pad(indent)}${name}: {\n${objectLines(entries, indent + 2)}\n${pad(indent)}}`;
  const parts = [block('Row', row), block('Insert', writeCols('insert')), block('Update', writeCols('update'))];
  parts.push(`${pad(indent)}Relationships: ${relLines}`);
  return parts.join('\n');
}

function renderFunction(fn, indent) {
  const modes = fn.modes;
  const names = fn.arg_names;
  const types = fn.arg_types || [];
  const inputs = [];
  const outputs = [];
  types.forEach((t, i) => {
    const mode = modes[i] || 'i';
    const name = names[i] || '';
    if (mode === 'i' || mode === 'b' || mode === 'v') inputs.push({ name, t, index: inputs.length });
    if (mode === 'o' || mode === 'b' || mode === 't') outputs.push({ name, t });
  });
  const firstDefault = fn.nargs - fn.nargdefaults;
  let args;
  if (inputs.length === 0) {
    args = 'never';
  } else {
    const entries = inputs
      .map((a) => [`${ident(a.name)}${a.index >= firstDefault ? '?' : ''}`, tsType(a.t)])
      .sort((x, y) => x[0].replace('?', '').localeCompare(y[0].replace('?', '')));
    args = `{ ${entries.map(([k, v]) => `${k}: ${v}`).join('; ')} }`;
  }

  let returns;
  const tableModes = modes.includes('t');
  if (tableModes || outputs.length > 1) {
    const entries = outputs.map((o) => [ident(o.name), tsType(o.t)]).sort((x, y) => x[0].localeCompare(y[0]));
    const obj = `{\n${entries.map(([k, v]) => `${pad(indent + 4)}${k}: ${v}`).join('\n')}\n${pad(indent + 2)}}`;
    returns = fn.returns_set ? `${obj}[]` : obj;
  } else if (fn.return_relation && relationByName.has(fn.return_relation)) {
    const rel = relationByName.get(fn.return_relation);
    const entries = rel.columns.map((c) => [ident(c.name), `${tsType(c)}${c.nullable ? ' | null' : ''}`]);
    const obj = `{\n${entries.map(([k, v]) => `${pad(indent + 4)}${k}: ${v}`).join('\n')}\n${pad(indent + 2)}}`;
    returns = fn.returns_set ? `${obj}[]` : obj;
  } else {
    const t = tsType({ type: fn.return_type, typtype: fn.return_typtype, elem: fn.return_elem });
    returns = fn.returns_set ? `${t}[]` : t;
  }
  return `${pad(indent)}Args: ${args}\n${pad(indent)}Returns: ${returns}`;
}

// ---------------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------------
const tables = relations.filter((r) => r.kind === 'r' || r.kind === 'p' || r.kind === 'f');
const views = relations.filter((r) => r.kind === 'v' || r.kind === 'm');

const never = (indent) => `{\n${pad(indent + 2)}[_ in never]: never\n${pad(indent)}}`;

function section(items, render, indent) {
  if (!items.length) return never(indent);
  return `{\n${items.map((it) => `${pad(indent + 2)}${ident(it.name)}: {\n${render(it, indent + 4)}\n${pad(indent + 2)}}`).join('\n')}\n${pad(indent)}}`;
}

// overloaded functions → union of signatures
const fnGroups = new Map();
for (const fn of functions) {
  if (!fnGroups.has(fn.name)) fnGroups.set(fn.name, []);
  fnGroups.get(fn.name).push(fn);
}
const fnSection = fnGroups.size
  ? `{\n${[...fnGroups.entries()]
      .map(([name, overloads]) => {
        if (overloads.length === 1) {
          return `${pad(6)}${ident(name)}: {\n${renderFunction(overloads[0], 8)}\n${pad(6)}}`;
        }
        return `${pad(6)}${ident(name)}:\n${overloads
          .map((o) => `${pad(8)}| {\n${renderFunction(o, 10)}\n${pad(10)}}`)
          .join('\n')}`;
      })
      .join('\n')}\n${pad(4)}}`
  : never(4);

const enumSection = enums.length
  ? `{\n${enums.map((e) => `${pad(6)}${ident(e.name)}: ${e.values.map((v) => JSON.stringify(v)).join(' | ')}`).join('\n')}\n${pad(4)}}`
  : never(4);

const compositeSection = composites.length
  ? `{\n${composites
      .map(
        (c) =>
          `${pad(6)}${ident(c.name)}: {\n${c.attributes
            .map((a) => `${pad(8)}${ident(a.name)}: ${tsType(a)} | null`)
            .join('\n')}\n${pad(6)}}`,
      )
      .join('\n')}\n${pad(4)}}`
  : never(4);

const constantsEnums = enums.length
  ? `{\n${enums.map((e) => `${pad(6)}${ident(e.name)}: [${e.values.map((v) => JSON.stringify(v)).join(', ')}],`).join('\n')}\n${pad(4)}}`
  : '{}';

const output = `// GENERATED by scripts/gen-db-types.mjs from the live database schema — do not edit by hand.
// Regenerate with \`pnpm db:types\` after every migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "${POSTGREST_VERSION}"
  }
  ${SCHEMA}: {
    Tables: ${section(tables, renderTable, 4)}
    Views: ${section(views, renderTable, 4)}
    Functions: ${fnSection}
    Enums: ${enumSection}
    CompositeTypes: ${compositeSection}
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "${SCHEMA}">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  ${SCHEMA}: {
    Enums: ${constantsEnums},
  },
} as const
`;

const outPath = resolve(ROOT, arg('--out') ?? 'src/types/database.ts');
if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== output) {
    console.error(`gen-db-types: ${outPath} is out of date — run pnpm db:types`);
    process.exit(1);
  }
  console.log(`gen-db-types: ${outPath} is up to date`);
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, output);
  console.log(
    `gen-db-types: wrote ${outPath} (${tables.length} tables, ${views.length} views, ${functions.length} functions, ${enums.length} enums)`,
  );
}
