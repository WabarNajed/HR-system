'use client';

import { AlertCircleIcon, ArchiveIcon, CheckCircle2Icon, RotateCcwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { missingRequired } from '../../lib/mapping';
import { getSchema } from '../../lib/schemas';
import { EXTRA, IGNORE, type ColumnMapping, type ImportType } from '../../lib/types';
import type { SheetInspection } from '../../types';
import { useFieldLabel } from '../use-dm';

type Column = SheetInspection['columns'][number];

function ConfidenceBadge({ column, manual }: { column: Column; manual: boolean }) {
  const t = useTranslations('dataManagement.wizard.mapping');
  if (manual) return <Badge variant="neutral" size="sm">{t('manual')}</Badge>;
  if (column.method === 'none' || column.confidence === 0) return <span className="text-faint-foreground">{t('none')}</span>;
  if (column.method === 'values') return <Badge variant="info" size="sm">{t('confidenceValues')}</Badge>;
  if (column.method === 'exact') return <Badge variant="success" size="sm">{t('confidenceExact')}</Badge>;
  if (column.confidence >= 0.8) return <Badge variant="success" size="sm">{t('confidenceHigh')}</Badge>;
  if (column.confidence >= 0.6) return <Badge variant="info" size="sm">{t('confidenceMedium')}</Badge>;
  return <Badge variant="warning" size="sm">{t('confidenceLow')}</Badge>;
}

export function StepMapping({
  type,
  inspection,
  mapping,
  manual,
  onChange,
  onReset,
}: {
  type: ImportType;
  inspection: SheetInspection;
  mapping: ColumnMapping[];
  manual: ReadonlySet<number>;
  onChange: (index: number, target: string) => void;
  onReset: () => void;
}) {
  const t = useTranslations('dataManagement.wizard.mapping');
  const label = useFieldLabel(type);
  const schema = getSchema(type);
  const byIndex = useMemo(() => new Map(mapping.map((m) => [m.index, m])), [mapping]);
  const missing = missingRequired(type, mapping);
  const mappedCount = mapping.filter((m) => m.target !== IGNORE && m.target !== EXTRA).length;
  const required = new Set(schema.requiredAnyOf.flat());

  const optionsFor = (index: number): ComboboxOption[] => {
    const usedBy = new Map<string, string>();
    for (const m of mapping) if (m.index !== index && m.target !== IGNORE && m.target !== EXTRA) usedBy.set(m.target, m.label);
    const fieldOption = (key: string): ComboboxOption => ({
      value: key,
      label: label(key),
      description: usedBy.has(key) ? t('usedElsewhere', { column: usedBy.get(key)! }) : required.has(key) ? t('fieldGroups.required') : undefined,
      keywords: [key],
    });
    const special: ComboboxOption[] = [
      ...(schema.extraData ? [{ value: EXTRA, label: t('extra'), icon: <ArchiveIcon className="size-4 text-muted-foreground" /> }] : []),
      { value: IGNORE, label: t('ignore') },
    ];
    const req = schema.fields.filter((f) => required.has(f.key)).map((f) => fieldOption(f.key));
    const rest = schema.fields.filter((f) => !required.has(f.key)).map((f) => fieldOption(f.key));
    return [...special, ...req, ...rest];
  };

  const targetSelect = (column: Column) => {
    const current = byIndex.get(column.index)?.target ?? (schema.extraData ? EXTRA : IGNORE);
    return (
      <Combobox
        size="sm"
        value={current}
        options={optionsFor(column.index)}
        onChange={(v) => onChange(column.index, v ?? (schema.extraData ? EXTRA : IGNORE))}
        searchPlaceholder={t('searchField')}
        clearable={false}
        className="w-full"
        aria-describedby={`dm-col-${column.index}`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-section-title text-foreground">{t('title')}</h2>
          <p className="mt-1 text-meta text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={missing.length ? 'warning' : 'success'} size="md">
            {missing.length ? <AlertCircleIcon /> : <CheckCircle2Icon />}
            {t('summary', { mapped: mappedCount, total: mapping.length })}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onReset} disabled={manual.size === 0}>
            <RotateCcwIcon />
            {t('reset')}
          </Button>
        </div>
      </div>

      {missing.length ? (
        <Alert variant="warning">
          <AlertCircleIcon />
          <AlertDescription>{t('requiredMissing', { fields: missing.map((g) => g.map((k) => label(k)).join(' / ')).join(' · ') })}</AlertDescription>
        </Alert>
      ) : null}

      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-md border border-border md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-subtle text-xs font-semibold text-muted-foreground">
              <th className="w-[30%] px-3 py-2 text-start">{t('column')}</th>
              <th className="px-3 py-2 text-start">{t('samples')}</th>
              <th className="w-[30%] px-3 py-2 text-start">{t('field')}</th>
              <th className="w-28 px-3 py-2 text-start">{t('confidence')}</th>
            </tr>
          </thead>
          <tbody>
            {inspection.columns.map((column) => {
              const target = byIndex.get(column.index)?.target;
              const ignored = target === IGNORE;
              return (
                <tr key={column.index} className="border-t border-border align-middle">
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-muted px-1 text-[0.6875rem] font-semibold text-muted-foreground numeric">{column.letter}</span>
                      <span id={`dm-col-${column.index}`} className={ignored ? 'truncate text-muted-foreground line-through decoration-faint-foreground' : 'truncate font-medium text-foreground'}>
                        <bdi>{column.label}</bdi>
                      </span>
                    </div>
                  </td>
                  <td className="max-w-0 px-3 py-2">
                    {column.samples.length ? (
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {column.samples.map((s, i) => (
                          <span key={i} className="max-w-40 truncate rounded bg-subtle px-1.5 py-0.5 text-xs text-foreground ring-1 ring-border ring-inset">
                            <bdi>{s}</bdi>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-faint-foreground">{t('empty')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{targetSelect(column)}</td>
                  <td className="px-3 py-2">
                    <ConfidenceBadge column={column} manual={manual.has(column.index)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {inspection.columns.map((column) => (
          <li key={column.index} className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-muted px-1 text-[0.6875rem] font-semibold text-muted-foreground numeric">{column.letter}</span>
              <span id={`dm-col-${column.index}`} className="min-w-0 flex-1 truncate font-medium text-foreground">
                <bdi>{column.label}</bdi>
              </span>
              <ConfidenceBadge column={column} manual={manual.has(column.index)} />
            </div>
            {column.samples.length ? <div className="truncate text-xs text-muted-foreground"><bdi>{column.samples.join(' · ')}</bdi></div> : null}
            {targetSelect(column)}
          </li>
        ))}
      </ul>

      {schema.extraData ? <p className="text-xs text-muted-foreground">{t('extraHint')}</p> : null}
    </div>
  );
}
