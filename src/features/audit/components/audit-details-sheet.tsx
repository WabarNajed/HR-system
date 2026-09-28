'use client';

import { ArrowRightIcon, ExternalLinkIcon, LockIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, type ReactNode } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatRelative } from '@/lib/dates';
import { formatDateTime } from '@/lib/i18n/date-format';
import { cn } from '@/lib/utils';
import type { AuditTone } from '../labels';
import type { AuditEventView } from '../types';

export const TONE_BADGE: Record<AuditTone, BadgeVariant> = {
  primary: 'default',
  secondary: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  neutral: 'neutral',
};

const MASK = '***';

type ChangeEntry =
  | { field: string; kind: 'diff'; before: unknown; after: unknown; hasBefore: boolean; hasAfter: boolean }
  | { field: string; kind: 'value'; value: unknown };

/** `{field: {old, new}}` (row triggers) → diff entries; any other key → plain value entries. */
export function parseChanges(changes: unknown): ChangeEntry[] {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, unknown>).map(([field, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length > 0 && keys.every((k) => k === 'old' || k === 'new')) {
        const v = value as { old?: unknown; new?: unknown };
        return { field, kind: 'diff', before: v.old, after: v.new, hasBefore: 'old' in v, hasAfter: 'new' in v };
      }
    }
    return { field, kind: 'value', value };
  });
}

function hasMasked(entries: ChangeEntry[]): boolean {
  return entries.some((e) => (e.kind === 'diff' ? e.before === MASK || e.after === MASK : e.value === MASK));
}

function Value({ value }: { value: unknown }) {
  const t = useTranslations('audit.details');
  const tc = useTranslations('common');
  if (value === null || value === undefined || value === '') return <span className="text-faint-foreground">{t('empty')}</span>;
  if (value === MASK) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        <LockIcon className="size-3" aria-hidden />
        {t('masked')}
      </span>
    );
  }
  if (typeof value === 'boolean') return <span>{value ? tc('yes') : tc('no')}</span>;
  if (typeof value === 'object') {
    return (
      <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[0.75rem] leading-5 whitespace-pre-wrap break-all text-foreground" dir="ltr">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return (
    <bdi className="break-words whitespace-pre-wrap" dir="auto">
      {String(value)}
    </bdi>
  );
}

function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2 text-sm', className)}>
      <dt className="text-meta text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

export function AuditDetailsSheet({ event, onOpenChange }: { event: AuditEventView | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('audit');
  const locale = useLocale();
  // The sheet is opened programmatically (row / timeline button, deep link), so Radix has no trigger
  // to return focus to: remember the opener ourselves and restore it on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const entries = event ? parseChanges(event.changes) : [];
  const masked = hasMasked(entries);
  const diffs = entries.filter((e) => e.kind === 'diff');
  const values = entries.filter((e) => e.kind === 'value');
  // Row creations only carry new values and deletions only old ones → one value column.
  const diffMode: 'created' | 'deleted' | 'changed' = diffs.every((d) => d.kind === 'diff' && !d.hasBefore)
    ? 'created'
    : diffs.every((d) => d.kind === 'diff' && !d.hasAfter)
      ? 'deleted'
      : 'changed';

  return (
    <Sheet open={Boolean(event)} onOpenChange={onOpenChange}>
      <SheetContent
        side="end"
        className="sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          const active = document.activeElement;
          openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
          // Focus the dialog itself (announced by its title) instead of the first tabbable control —
          // a Copy button whose tooltip would open and swallow the first Escape.
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(e) => {
          const opener = openerRef.current;
          openerRef.current = null;
          if (opener?.isConnected) {
            e.preventDefault();
            opener.focus({ preventScroll: true });
          }
        }}
      >
        {event ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={TONE_BADGE[event.tone]} size="md">
                  {event.actionLabel}
                </Badge>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground" dir="ltr">
                  {event.action}
                </code>
              </div>
              <SheetTitle className="mt-1">{t('details.title', { id: event.id })}</SheetTitle>
              <SheetDescription className="numeric">
                {formatDateTime(event.createdAt, locale)} · {formatRelative(event.createdAt, locale)}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-5">
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('details.event')}</h3>
                <dl className="divide-y divide-border">
                  <Field label={t('columns.actor')}>
                    {event.actor.id || event.actor.email ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <EmployeeAvatar name={event.actor.name || event.actor.email || '?'} seed={event.actor.id ?? event.actor.email ?? ''} size="xs" />
                        <span className="min-w-0">
                          {event.actor.name ? <span className="block truncate font-medium">{event.actor.name}</span> : null}
                          {event.actor.email ? (
                            <bdi className="block truncate text-meta text-muted-foreground" dir="ltr">
                              {event.actor.email}
                            </bdi>
                          ) : null}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <UserRoundIcon className="size-3.5" aria-hidden />
                        {t('system')}
                      </span>
                    )}
                  </Field>
                  <Field label={t('columns.entity')}>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{event.entityLabel || t('details.empty')}</span>
                      {event.href ? (
                        <Link href={event.href} className="inline-flex items-center gap-1 text-meta text-primary hover:underline">
                          {t('details.openRecord')}
                          <ArrowRightIcon className="size-3 rtl:rotate-180" aria-hidden />
                        </Link>
                      ) : null}
                    </span>
                  </Field>
                  {event.entityId ? (
                    <Field label={t('details.entityId')}>
                      <span className="flex min-w-0 items-center gap-1">
                        <code className="min-w-0 truncate font-mono text-[0.75rem]" dir="ltr">
                          {event.entityId}
                        </code>
                        <CopyButton value={event.entityId} size="icon-xs" />
                      </span>
                    </Field>
                  ) : null}
                  {event.summary ? (
                    <Field label={t('columns.summary')}>
                      <Value value={event.summary} />
                    </Field>
                  ) : null}
                  {event.employeeId ? (
                    <Field label={t('details.employee')}>
                      {event.employeeHref ? (
                        <Link href={event.employeeHref} className="inline-flex items-center gap-1 text-primary hover:underline">
                          {t('details.openEmployee')}
                          <ExternalLinkIcon className="size-3" aria-hidden />
                        </Link>
                      ) : (
                        <code className="font-mono text-[0.75rem]" dir="ltr">
                          {event.employeeId}
                        </code>
                      )}
                    </Field>
                  ) : null}
                  <Field label={t('columns.ip')}>
                    {event.ip ? (
                      <code className="font-mono text-[0.75rem]" dir="ltr">
                        {event.ip}
                      </code>
                    ) : (
                      <span className="text-faint-foreground">{t('details.empty')}</span>
                    )}
                  </Field>
                  <Field label={t('details.userAgent')}>
                    {event.userAgent ? (
                      <span className="block truncate font-mono text-[0.75rem] text-muted-foreground" dir="ltr" title={event.userAgent}>
                        {event.userAgent}
                      </span>
                    ) : (
                      <span className="text-faint-foreground">{t('details.empty')}</span>
                    )}
                  </Field>
                </dl>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t('details.changes', { count: diffs.length })}
                  </h3>
                  {masked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <LockIcon className="size-3" aria-hidden />
                      {t('details.maskedNote')}
                    </span>
                  ) : null}
                </div>
                {diffs.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-meta text-muted-foreground">
                    {t('details.noChanges')}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full table-fixed text-sm">
                      <thead className="bg-subtle text-xs text-muted-foreground">
                        <tr>
                          <th className="w-[32%] px-3 py-2 text-start font-medium">{t('details.field')}</th>
                          {diffMode === 'created' ? (
                            <th className="px-3 py-2 text-start font-medium">{t('details.value')}</th>
                          ) : diffMode === 'deleted' ? (
                            <th className="px-3 py-2 text-start font-medium">{t('details.previousValue')}</th>
                          ) : (
                            <>
                              <th className="px-3 py-2 text-start font-medium">{t('details.before')}</th>
                              <th className="px-3 py-2 text-start font-medium">{t('details.after')}</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {diffs.map((d) =>
                          d.kind === 'diff' ? (
                            <tr key={d.field} className="align-top">
                              <td className="px-3 py-2">
                                <code className="font-mono text-[0.75rem] break-all text-foreground" dir="ltr">
                                  {d.field}
                                </code>
                              </td>
                              {diffMode === 'created' ? (
                                <td className="px-3 py-2">
                                  <Value value={d.after} />
                                </td>
                              ) : diffMode === 'deleted' ? (
                                <td className="px-3 py-2">
                                  <Value value={d.before} />
                                </td>
                              ) : (
                                <>
                                  <td className={cn('px-3 py-2', d.hasBefore && d.hasAfter && 'bg-danger-soft/40')}>
                                    {d.hasBefore ? <Value value={d.before} /> : <span className="text-faint-foreground">—</span>}
                                  </td>
                                  <td className={cn('px-3 py-2', d.hasAfter && d.hasBefore && 'bg-success-soft/40')}>
                                    {d.hasAfter ? <Value value={d.after} /> : <span className="text-faint-foreground">—</span>}
                                  </td>
                                </>
                              )}
                            </tr>
                          ) : null,
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {values.length ? (
                <section>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('details.metadata')}</h3>
                  <dl className="divide-y divide-border">
                    {values.map((v) =>
                      v.kind === 'value' ? (
                        <Field
                          key={v.field}
                          label={
                            <code className="font-mono text-[0.75rem] break-all" dir="ltr">
                              {v.field}
                            </code>
                          }
                        >
                          <Value value={v.value} />
                        </Field>
                      ) : null,
                    )}
                  </dl>
                </section>
              ) : null}
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {t('details.close')}
              </Button>
              {event.href ? (
                <Button asChild size="sm">
                  <Link href={event.href}>
                    <ExternalLinkIcon />
                    {t('details.openRecord')}
                  </Link>
                </Button>
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
