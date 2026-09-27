'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDaysIcon, CircleDotIcon, CircleOffIcon, CirclePowerIcon, InfoIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef } from '@/components/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DatePicker } from '@/components/shared/date-picker';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { daysBetween } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';
import { deletePublicHoliday, savePublicHoliday, setPublicHolidayActive } from '../actions';
import type { HolidayRow } from '../types';
import { UrlSelect } from './url-controls';

type FormState = { name_ar: string; name_en: string; start_date: string | null; end_date: string | null; is_active: boolean };

function Field({ label, htmlFor, required, error, hint, children }: { label: ReactNode; htmlFor?: string; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode }) {
  const resolve = useErrorMessage();
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={htmlFor} data-error={Boolean(error)} className="data-[error=true]:text-danger">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-danger">{resolve(error)}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function HolidaySheet({ open, onOpenChange, row, year }: { open: boolean; onOpenChange: (open: boolean) => void; row: HolidayRow | null; year: number }) {
  const t = useTranslations('leave.holidays');
  const tc = useTranslations('common');
  const resolveError = useErrorMessage();
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const empty: FormState = { name_ar: '', name_en: '', start_date: null, end_date: null, is_active: true };
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = open ? (row?.id ?? 'new') : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setForm(row ? { name_ar: row.name_ar ?? '', name_en: row.name_en ?? '', start_date: row.start_date, end_date: row.end_date, is_active: row.is_active } : empty);
      setErrors({});
    }
  }
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const span = form.start_date && form.end_date && form.end_date >= form.start_date ? (daysBetween(form.start_date, form.end_date) ?? 0) + 1 : null;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!form.name_ar.trim() && !form.name_en.trim()) next.name_ar = 'leave.holidays.form.nameRequired';
    if (!form.start_date) next.start_date = 'validation.required';
    if (!form.end_date) next.end_date = 'validation.required';
    if (form.start_date && form.end_date && form.end_date < form.start_date) next.end_date = 'leave.holidays.form.endBeforeStart';
    setErrors(next);
    if (Object.keys(next).length) return;
    startTransition(async () => {
      const result = await savePublicHoliday({
        id: row?.id ?? null,
        name_ar: form.name_ar,
        name_en: form.name_en,
        start_date: form.start_date!,
        end_date: form.end_date!,
        is_active: form.is_active,
      });
      if (result.ok) {
        toast.success(t(row ? 'toast.updated' : 'toast.created'));
        onOpenChange(false);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(resolveError(result.error));
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <SheetContent side="end">
        <SheetHeader>
          <SheetTitle>{row ? t('form.editTitle') : t('form.createTitle')}</SheetTitle>
          <SheetDescription>{t('form.description')}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id={`${uid}-form`}
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label={tc('nameAr')} htmlFor={`${uid}-ar`} error={errors.name_ar}>
              <Input id={`${uid}-ar`} dir="rtl" value={form.name_ar} maxLength={120} onChange={(e) => set('name_ar', e.target.value)} aria-invalid={Boolean(errors.name_ar) || undefined} />
            </Field>
            <Field label={tc('nameEn')} htmlFor={`${uid}-en`} error={errors.name_en} hint={t('form.nameHint')}>
              <Input id={`${uid}-en`} dir="ltr" value={form.name_en} maxLength={120} onChange={(e) => set('name_en', e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('startDate')} htmlFor={`${uid}-start`} required error={errors.start_date}>
                <DatePicker
                  id={`${uid}-start`}
                  value={form.start_date}
                  onChange={(v) => {
                    set('start_date', v);
                    if (v && (!form.end_date || form.end_date < v)) set('end_date', v);
                  }}
                  aria-invalid={Boolean(errors.start_date) || undefined}
                />
              </Field>
              <Field label={tc('endDate')} htmlFor={`${uid}-end`} required error={errors.end_date}>
                <DatePicker id={`${uid}-end`} value={form.end_date} min={form.start_date ?? undefined} onChange={(v) => set('end_date', v)} aria-invalid={Boolean(errors.end_date) || undefined} />
              </Field>
            </div>
            {span ? (
              <p className="text-meta text-muted-foreground">
                {t('form.span', { count: span, year: form.start_date?.slice(0, 4) ?? String(year) })}
              </p>
            ) : null}
            <div className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-2.5">
              <div>
                <Label htmlFor={`${uid}-active`} className="cursor-pointer">
                  {tc('active')}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('form.activeHint')}</p>
              </div>
              <Switch id={`${uid}-active`} checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} className="mt-0.5" />
            </div>
            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>{t('impact')}</AlertDescription>
            </Alert>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form={`${uid}-form`} loading={pending}>
            {row ? tc('saveChanges') : t('add')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Public holidays for one year: used by /settings/public-holidays and the Public Holidays tab of
 * /leave. Read-only unless `canEdit`. The year lives in the URL (`yearParam`).
 */
export function HolidaysManager({
  rows,
  year,
  years,
  currentYear,
  today,
  canEdit,
  yearParam = 'year',
}: {
  rows: HolidayRow[];
  year: number;
  years: number[];
  currentYear: number;
  today: string;
  canEdit: boolean;
  yearParam?: string;
}) {
  const t = useTranslations('leave.holidays');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const resolveError = useErrorMessage();
  const router = useRouter();
  const [sheet, setSheet] = useState<{ open: boolean; row: HolidayRow | null }>({ open: false, row: null });
  const [confirmDelete, setConfirmDelete] = useState<HolidayRow | null>(null);
  const [, startTransition] = useTransition();

  const columns = useMemo<ColumnDef<HolidayRow>[]>(() => {
    const toggle = (row: HolidayRow) =>
      startTransition(async () => {
        const result = await setPublicHolidayActive({ id: row.id, active: !row.is_active });
        if (result.ok) {
          toast.success(t(row.is_active ? 'toast.deactivated' : 'toast.activated'));
          router.refresh();
        } else toast.error(resolveError(result.error));
      });
    return [
      {
        id: 'name',
        accessorFn: (r) => localized(r, 'name', locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('name')} />,
        cell: ({ row }) => {
          const r = row.original;
          const upcoming = r.is_active && r.end_date >= today && r.start_date > today;
          const ongoing = r.is_active && r.start_date <= today && r.end_date >= today;
          const other = locale === 'ar' ? r.name_en : r.name_ar;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', r.is_active ? 'bg-secondary-soft text-secondary-soft-foreground' : 'bg-muted text-muted-foreground')}>
                <CalendarDaysIcon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-foreground">{localized(r, 'name', locale)}</span>
                  {ongoing ? (
                    <Badge variant="success" size="sm">
                      {t('ongoing')}
                    </Badge>
                  ) : upcoming ? (
                    <Badge variant="info" size="sm">
                      {t('upcoming')}
                    </Badge>
                  ) : null}
                </div>
                {other && other !== localized(r, 'name', locale) ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{other}</div> : null}
              </div>
            </div>
          );
        },
        meta: { label: tc('name'), width: '18rem' },
        enableHiding: false,
      },
      {
        id: 'start_date',
        accessorKey: 'start_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('startDate')} />,
        cell: ({ row }) => <span className="numeric whitespace-nowrap">{fmt.date(row.original.start_date)}</span>,
        meta: { label: tc('startDate') },
      },
      {
        id: 'end_date',
        accessorKey: 'end_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('endDate')} />,
        cell: ({ row }) => <span className="numeric whitespace-nowrap">{fmt.date(row.original.end_date)}</span>,
        meta: { label: tc('endDate') },
      },
      {
        id: 'days',
        accessorKey: 'days',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.days')} />,
        cell: ({ row }) => <span className="font-medium numeric">{formatInteger(row.original.days, locale)}</span>,
        meta: { label: t('fields.days'), align: 'end', headerClassName: 'whitespace-nowrap' },
      },
      {
        id: 'working_days',
        accessorKey: 'working_days',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.workingDays')} />,
        cell: ({ row }) => <span className="numeric text-muted-foreground">{formatInteger(row.original.working_days, locale)}</span>,
        meta: { label: t('fields.workingDays'), align: 'end', headerClassName: 'whitespace-nowrap' },
      },
      {
        id: 'is_active',
        accessorKey: 'is_active',
        header: () => tc('status'),
        cell: ({ row }) => <StatusBadge domain="record" status={row.original.is_active ? 'active' : 'inactive'} size="sm" />,
        enableSorting: false,
        meta: { label: tc('status'), width: '6.5rem' },
      },
      ...(canEdit
        ? [
            actionsColumn<HolidayRow>((row) => [
              { label: tc('edit'), icon: PencilIcon, onSelect: () => setSheet({ open: true, row }) },
              { label: row.is_active ? tc('deactivate') : tc('activate'), icon: row.is_active ? CircleOffIcon : CirclePowerIcon, onSelect: () => toggle(row) },
              { label: tc('delete'), icon: Trash2Icon, variant: 'destructive', separatorBefore: true, onSelect: () => setConfirmDelete(row) },
            ]),
          ]
        : []),
    ];
  }, [t, tc, locale, fmt, today, canEdit, router, resolveError]);

  const filters: FilterDef<HolidayRow>[] = [
    {
      key: 'status',
      title: tc('status'),
      icon: CircleDotIcon,
      options: [
        { value: 'active', label: tc('active') },
        { value: 'inactive', label: tc('inactive') },
      ],
      accessor: (r) => (r.is_active ? 'active' : 'inactive'),
    },
  ];

  const totalWorking = rows.filter((r) => r.is_active).reduce((s, r) => s + r.working_days, 0);

  const addButton = canEdit ? (
    <Button size="sm" onClick={() => setSheet({ open: true, row: null })}>
      <PlusIcon />
      {t('add')}
    </Button>
  ) : (
    <SimpleTooltip content={t('readOnly')}>
      <span tabIndex={0} className="inline-flex">
        <Button size="sm" disabled>
          <PlusIcon />
          {t('add')}
        </Button>
      </span>
    </SimpleTooltip>
  );

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        tableId="public-holidays"
        mode="client"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={canEdit ? (r) => setSheet({ open: true, row: r }) : undefined}
        filters={filters}
        searchPlaceholder={t('searchPlaceholder')}
        searchText={(r) => `${r.name_ar ?? ''} ${r.name_en ?? ''}`}
        toolbarActions={
          <>
            <UrlSelect
              param={yearParam}
              defaultValue={String(currentYear)}
              label={t('year')}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
            />
            {addButton}
          </>
        }
        defaultSort={{ id: 'start_date', desc: false }}
        maxHeight="none"
        pagination={rows.length > 25}
        emptyState={{
          icon: CalendarDaysIcon,
          title: t('emptyTitle', { year }),
          description: canEdit ? t('emptyDescription') : t('emptyReadOnly'),
          action: canEdit ? addButton : undefined,
        }}
        renderMobileCard={(r) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{localized(r, 'name', locale)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground numeric">
                {fmt.range(r.start_date, r.end_date)} · {t('daysCount', { count: r.days })}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <StatusBadge domain="record" status={r.is_active ? 'active' : 'inactive'} size="sm" />
              {canEdit ? (
                <Button variant="ghost" size="icon-sm" aria-label={tc('edit')} onClick={() => setSheet({ open: true, row: r })}>
                  <PencilIcon />
                </Button>
              ) : null}
            </div>
          </div>
        )}
      />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          {t('yearSummary', { count: rows.filter((r) => r.is_active).length, days: totalWorking })} — {t('impact')}
        </span>
      </p>
      {canEdit ? (
        <>
          <HolidaySheet open={sheet.open} row={sheet.row} year={year} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} />
          <ConfirmDialog
            open={Boolean(confirmDelete)}
            onOpenChange={(o) => !o && setConfirmDelete(null)}
            variant="danger"
            title={t('deleteTitle')}
            description={t('deleteDescription', { name: confirmDelete ? localized(confirmDelete, 'name', locale) : '' })}
            confirmLabel={tc('delete')}
            onConfirm={async () => {
              if (!confirmDelete) return;
              const result = await deletePublicHoliday({ id: confirmDelete.id });
              if (!result.ok) {
                toast.error(resolveError(result.error));
                return false;
              }
              toast.success(t('toast.deleted'));
              router.refresh();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
