'use client';

import { HistoryIcon, RotateCcwIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import type { TemplateDraft, TemplateVersion } from '../../types';

const DIFF_FIELDS = [
  'name_ar',
  'name_en',
  'certificate_type',
  'variant',
  'language',
  'content_ar',
  'content_en',
  'header_html',
  'footer_html',
  'show_logo',
  'show_stamp',
  'show_signature',
  'show_qr',
] as const satisfies readonly (keyof TemplateDraft)[];

const TEXT_FIELDS = new Set(['content_ar', 'content_en', 'header_html', 'footer_html']);

function plain(html: unknown): string {
  return typeof html === 'string' ? html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Which fields changed between two snapshots (content fields compared by their text, so editor
 * normalization of the markup is not reported), the text-length delta, and whether only the
 * formatting of content fields changed.
 */
export function diffSnapshots(prev: Partial<TemplateDraft> | undefined, next: Partial<TemplateDraft>) {
  if (!prev) return { fields: [] as string[], delta: 0, formatting: false };
  const fields: string[] = [];
  let delta = 0;
  let formatting = false;
  for (const f of DIFF_FIELDS) {
    const a = prev[f] ?? null;
    const b = next[f] ?? null;
    if (TEXT_FIELDS.has(f)) {
      if (plain(a) !== plain(b)) {
        fields.push(f);
        delta += plain(b).length - plain(a).length;
      } else if ((a ?? '') !== (b ?? '')) {
        formatting = true;
      }
    } else if (a !== b) {
      fields.push(f);
    }
  }
  return { fields, delta, formatting };
}

export function VersionHistorySheet({
  open,
  onOpenChange,
  versions,
  currentVersion,
  publishedVersion,
  canRestore,
  restoreBlockedReason,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: TemplateVersion[];
  currentVersion: number;
  publishedVersion: number | null;
  canRestore: boolean;
  restoreBlockedReason?: string | null;
  onRestore: (version: TemplateVersion) => Promise<boolean>;
}) {
  const t = useTranslations('templates.versions');
  const tl = useTranslations('templates.list');
  const locale = useLocale();
  const fmt = useDateFormat();
  const [restoring, setRestoring] = useState<TemplateVersion | null>(null);
  const maxVersion = versions.reduce((m, v) => Math.max(m, v.version), 0);
  const fieldName = (f: string) => (t as unknown as (k: string) => string)(`fieldNames.${f}`);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="border-b border-border px-5 pt-5 pb-4">
          <SheetTitle className="flex items-center gap-2 pe-8">
            <HistoryIcon className="size-4.5 text-primary" aria-hidden />
            {t('title')}
          </SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ol className="relative flex flex-col gap-3 border-s border-border ps-5">
            {versions.map((v, index) => {
              const prev = versions[index + 1];
              const { fields, delta, formatting } = diffSnapshots(prev?.snapshot, v.snapshot);
              const isCurrent = v.version === currentVersion;
              const isPublished = v.version === publishedVersion;
              const blocked = !canRestore ? restoreBlockedReason : isCurrent ? t('restoreDisabledCurrent') : restoreBlockedReason;
              return (
                <li key={v.version} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -start-[1.6875rem] top-3 size-3 rounded-full border-2 border-card ring-1',
                      isCurrent ? 'bg-primary ring-primary' : isPublished ? 'bg-success ring-success' : 'bg-border-strong ring-border',
                    )}
                  />
                  <div className={cn('rounded-lg border bg-card p-3', isCurrent ? 'border-primary/40 shadow-xs' : 'border-border')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="numeric text-sm font-semibold">{tl('versionLabel', { version: v.version })}</span>
                          {isCurrent ? (
                            <Badge variant="default" size="sm">
                              {t('current')}
                            </Badge>
                          ) : null}
                          {isPublished ? (
                            <Badge variant="success" size="sm">
                              {t('published')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-meta text-muted-foreground">
                          <span className="numeric">{fmt.dateTime(v.changed_at)}</span>
                          {' · '}
                          {t('by', { name: v.changed_by_name || t('unknownUser') })}
                        </p>
                      </div>
                      <SimpleTooltip content={blocked ?? null}>
                        <span tabIndex={blocked ? 0 : undefined} className="inline-flex">
                          <Button size="sm" variant="ghost" className="h-7 px-2" disabled={Boolean(blocked)} onClick={() => setRestoring(v)}>
                            <RotateCcwIcon />
                            {t('restore')}
                          </Button>
                        </span>
                      </SimpleTooltip>
                    </div>
                    {v.change_notes ? <p className="mt-2 text-sm text-foreground">{v.change_notes}</p> : null}
                    {prev ? (
                      <p className="mt-2 text-2xs leading-4 text-muted-foreground">
                        {fields.length ? t('changed', { fields: fields.map(fieldName).join(locale === 'ar' ? '، ' : ', ') }) : formatting ? t('formattingOnly') : t('noChanges')}
                        {delta ? (
                          <span className={cn('ms-1.5 numeric font-medium', delta > 0 ? 'text-success' : 'text-danger')}>
                            ({t('chars', { sign: delta > 0 ? '+' : '−', count: Math.abs(delta) })})
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </SheetContent>
      <ConfirmDialog
        open={Boolean(restoring)}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={t('restoreTitle', { version: restoring?.version ?? 0 })}
        description={t('restoreDescription', { next: maxVersion + 1 })}
        confirmLabel={t('restore')}
        onConfirm={async () => {
          if (!restoring) return false;
          const ok = await onRestore(restoring);
          if (ok) setRestoring(null);
          return ok;
        }}
      />
    </Sheet>
  );
}
