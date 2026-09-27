'use client';

import { EyeOffIcon, Layers2Icon, Loader2Icon, SheetIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { columnLetter } from '../../lib/normalize';
import type { ImportType } from '../../lib/types';
import type { SheetInspection } from '../../types';

export function StepSheet({
  type,
  inspection,
  busy,
  onChange,
}: {
  type: ImportType;
  inspection: SheetInspection;
  busy: boolean;
  onChange: (next: { sheetIndex: number; headerRow: number }) => void;
}) {
  const t = useTranslations('dataManagement');
  const width = Math.max(1, ...inspection.preview.map((r) => r.length));
  const headerOptions = inspection.preview.map((_, i) => i).filter((i) => inspection.preview[i]!.some((c) => c));
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h2 className="text-section-title text-foreground">{t('wizard.sheet.title')}</h2>
          <p className="mt-1 text-meta text-muted-foreground">{t('wizard.sheet.description', { type: t(`types.${type}.title`) })}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-semibold text-muted-foreground">{t('wizard.sheet.sheet')}</div>
          <div role="radiogroup" aria-label={t('wizard.sheet.sheet')} className="flex flex-col gap-1.5">
            {inspection.sheets.map((s) => {
              const active = s.index === inspection.sheetIndex;
              return (
                <button
                  key={s.index}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => !active && onChange({ sheetIndex: s.index, headerRow: -1 })}
                  className={cn(
                    'flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2 text-start transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-70',
                    active ? 'border-primary bg-primary-soft/50' : 'border-border bg-card hover:bg-subtle',
                  )}
                >
                  <SheetIcon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    <bdi>{s.name}</bdi>
                  </span>
                  {s.hidden ? (
                    <Badge variant="neutral" size="sm">
                      <EyeOffIcon />
                      {t('wizard.sheet.hidden')}
                    </Badge>
                  ) : null}
                  <span className="shrink-0 text-xs text-muted-foreground numeric">{t('wizard.sheet.sheetRows', { count: s.rows })}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="dm-header-row">
            {t('wizard.sheet.headerRow')}
          </label>
          <Select value={String(inspection.headerRow)} onValueChange={(v) => onChange({ sheetIndex: inspection.sheetIndex, headerRow: Number(v) })} disabled={busy}>
            <SelectTrigger id="dm-header-row" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {headerOptions.map((i) => (
                <SelectItem key={i} value={String(i)}>
                  {t('wizard.sheet.rowLabel', { row: i + 1 })}
                  <span className="ms-2 max-w-40 truncate text-xs text-muted-foreground">{inspection.preview[i]!.filter(Boolean).slice(0, 3).join(' · ')}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <dl className="flex flex-col gap-2 rounded-md border border-border bg-subtle/70 p-3 text-meta">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{t('wizard.sheet.records', { count: '' }).replace(/\s+/g, ' ').trim()}</dt>
            <dd className="text-base font-semibold text-foreground numeric">{inspection.records}</dd>
          </div>
          {inspection.skipped.blank + inspection.skipped.repeated + inspection.skipped.summary > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('wizard.sheet.skipped', { blank: inspection.skipped.blank, repeated: inspection.skipped.repeated + inspection.skipped.summary })}
            </p>
          ) : null}
          {inspection.headerRows === 2 ? (
            <p className="flex items-start gap-1.5 text-xs text-info">
              <Layers2Icon className="mt-px size-3.5 shrink-0" aria-hidden />
              {t('wizard.sheet.twoRowHeader')}
            </p>
          ) : null}
        </dl>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-muted-foreground">{t('wizard.sheet.preview')}</div>
          {busy ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
              {t('wizard.sheet.updating')}
            </span>
          ) : null}
        </div>
        <div className={cn('overflow-auto rounded-md border border-border', busy && 'opacity-60')}>
          <table className="w-full border-collapse text-meta numeric">
            <thead>
              <tr className="bg-subtle">
                <th className="sticky start-0 z-10 w-10 border-e border-b border-border bg-subtle px-2 py-1.5 text-xs font-semibold text-muted-foreground" />
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} className="border-e border-b border-border px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground last:border-e-0">
                    {columnLetter(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inspection.preview.map((row, r) => {
                const isHeader = r === inspection.headerRow || (inspection.headerRows === 2 && r === inspection.headerRow + 1);
                const above = r < inspection.headerRow;
                return (
                  <tr
                    key={r}
                    onClick={() => !busy && row.some(Boolean) && r !== inspection.headerRow && onChange({ sheetIndex: inspection.sheetIndex, headerRow: r })}
                    className={cn('cursor-pointer', isHeader ? 'bg-primary-soft font-semibold text-foreground' : above ? 'text-faint-foreground' : 'text-foreground hover:bg-subtle')}
                  >
                    <td className={cn('sticky start-0 z-10 border-e border-b border-border px-2 py-1.5 text-center text-xs', isHeader ? 'bg-primary text-primary-foreground' : 'bg-subtle text-muted-foreground')}>{r + 1}</td>
                    {Array.from({ length: width }, (_, c) => (
                      <td key={c} className="max-w-48 truncate border-e border-b border-border px-2 py-1.5 last:border-e-0">
                        <bdi>{row[c] ?? ''}</bdi>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{t('wizard.sheet.previewHint')}</p>
      </div>
    </div>
  );
}
