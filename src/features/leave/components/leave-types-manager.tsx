'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  CheckIcon,
  CircleDotIcon,
  CircleOffIcon,
  CirclePowerIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  TagsIcon,
  Trash2Icon,
  UploadIcon,
  WalletCardsIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { actionsColumn, DataTable, type FilterDef } from '@/components/data-table';
import { ColorPicker } from '@/components/shared/color-picker';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { formatDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import { deleteLeaveType, saveLeaveType, setLeaveTypeActive } from '../actions';
import type { LeaveTypeRow } from '../types';
import { LeaveTypeDot } from './leave-type-dot';
import { SortHeader } from './sort-header';

type FormState = {
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  is_paid: boolean;
  deducts_balance: boolean;
  default_entitlement: string;
  max_days_per_request: string;
  day_count_basis: 'working' | 'calendar';
  requires_attachment: boolean;
  gender_restriction: 'all' | 'male' | 'female';
  color: string;
  sort_order: string;
  is_active: boolean;
};

function toForm(row: LeaveTypeRow | null, nextSort: number): FormState {
  return {
    code: row?.code ?? '',
    name_ar: row?.name_ar ?? '',
    name_en: row?.name_en ?? '',
    description_ar: row?.description_ar ?? '',
    description_en: row?.description_en ?? '',
    is_paid: row?.is_paid ?? true,
    deducts_balance: row?.deducts_balance ?? false,
    default_entitlement: String(row?.default_entitlement ?? 0),
    max_days_per_request: row?.max_days_per_request != null ? String(row.max_days_per_request) : '',
    day_count_basis: row?.day_count_basis ?? 'working',
    requires_attachment: row?.requires_attachment ?? false,
    gender_restriction: row?.gender_restriction ?? 'all',
    color: (row?.color ?? '#0F5E6B').toLowerCase(),
    sort_order: String(row?.sort_order ?? nextSort),
    is_active: row?.is_active ?? true,
  };
}

function Field({ label, htmlFor, required, hint, error, children, className }: { label: ReactNode; htmlFor?: string; required?: boolean; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  const resolve = useErrorMessage();
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
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

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

export function LeaveTypeSheet({
  open,
  onOpenChange,
  row,
  nextSort,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: LeaveTypeRow | null;
  nextSort: number;
}) {
  const t = useTranslations('leave');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const resolveError = useErrorMessage();
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => toForm(row, nextSort));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = open ? (row?.id ?? 'new') : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setForm(toForm(row, nextSort));
      setErrors({});
    }
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Editing a field clears its error (the rest stay until the next submit).
    setErrors((e) => (e[k as string] ? { ...e, [k]: '' } : e));
  };
  const id = (name: string) => `${uid}-${name}`;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!row && !/^[a-z][a-z0-9_]*$/.test(form.code.trim().toLowerCase())) next.code = form.code.trim() ? 'leave.types.form.codePattern' : 'validation.required';
    if (!form.name_ar.trim()) next.name_ar = 'validation.required';
    if (!form.name_en.trim()) next.name_en = 'validation.required';
    const ent = Number(form.default_entitlement);
    if (form.default_entitlement.trim() === '' || !Number.isFinite(ent) || ent < 0 || ent > 365) next.default_entitlement = 'validation.invalidValue';
    if (form.max_days_per_request.trim() !== '') {
      const m = Number(form.max_days_per_request);
      if (!Number.isFinite(m) || m <= 0 || m > 365) next.max_days_per_request = 'validation.invalidValue';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    startTransition(async () => {
      const result = await saveLeaveType({
        id: row?.id ?? null,
        code: row?.code ?? form.code.trim().toLowerCase(),
        name_ar: form.name_ar,
        name_en: form.name_en,
        description_ar: form.description_ar,
        description_en: form.description_en,
        is_paid: form.is_paid,
        deducts_balance: form.deducts_balance,
        default_entitlement: Number(form.default_entitlement),
        max_days_per_request: form.max_days_per_request.trim() === '' ? null : Number(form.max_days_per_request),
        day_count_basis: form.day_count_basis,
        requires_attachment: form.requires_attachment,
        gender_restriction: form.gender_restriction === 'all' ? null : form.gender_restriction,
        color: form.color,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      });
      if (result.ok) {
        toast.success(t(row ? 'types.toast.updated' : 'types.toast.created'));
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
      <SheetContent side="end" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{row ? t('types.form.editTitle') : t('types.form.createTitle')}</SheetTitle>
          <SheetDescription>{t('types.form.description')}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id={id('form')}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-6"
          >
            <section className="grid gap-4">
              <h3 className="text-sm font-semibold text-foreground">{t('types.form.identity')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('types.fields.nameAr')} htmlFor={id('name_ar')} required error={errors.name_ar}>
                  <Input id={id('name_ar')} dir="rtl" value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} maxLength={120} aria-invalid={Boolean(errors.name_ar) || undefined} />
                </Field>
                <Field label={t('types.fields.nameEn')} htmlFor={id('name_en')} required error={errors.name_en}>
                  <Input id={id('name_en')} dir="ltr" value={form.name_en} onChange={(e) => set('name_en', e.target.value)} maxLength={120} aria-invalid={Boolean(errors.name_en) || undefined} />
                </Field>
                <Field
                  label={tc('code')}
                  htmlFor={id('code')}
                  required={!row}
                  error={errors.code}
                  hint={row ? t('types.form.codeLocked') : t('types.form.codeHint')}
                >
                  <Input
                    id={id('code')}
                    dir="ltr"
                    value={form.code}
                    onChange={(e) => set('code', e.target.value)}
                    disabled={Boolean(row)}
                    maxLength={63}
                    className="font-mono text-meta leading-6"
                    placeholder="annual" // i18n-ignore
                    aria-invalid={Boolean(errors.code) || undefined}
                  />
                </Field>
                <Field label={t('types.fields.color')} htmlFor={id('color')}>
                  <ColorPicker id={id('color')} value={form.color} onChange={(v) => set('color', v ?? '#0f5e6b')} />
                </Field>
                <Field label={tc('descriptionAr')} htmlFor={id('description_ar')}>
                  <Textarea id={id('description_ar')} dir="rtl" rows={2} maxLength={500} value={form.description_ar} onChange={(e) => set('description_ar', e.target.value)} />
                </Field>
                <Field label={tc('descriptionEn')} htmlFor={id('description_en')}>
                  <Textarea id={id('description_en')} dir="ltr" rows={2} maxLength={500} value={form.description_en} onChange={(e) => set('description_en', e.target.value)} />
                </Field>
              </div>
            </section>

            <section className="grid gap-4">
              <h3 className="text-sm font-semibold text-foreground">{t('types.form.rules')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('types.fields.basis')} htmlFor={id('basis')} hint={t('types.form.basisHint')}>
                  <Select value={form.day_count_basis} onValueChange={(v) => set('day_count_basis', v as 'working' | 'calendar')}>
                    <SelectTrigger id={id('basis')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working">{te('dayCountBasis.working')}</SelectItem>
                      <SelectItem value="calendar">{te('dayCountBasis.calendar')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('types.fields.gender')} htmlFor={id('gender')}>
                  <Select value={form.gender_restriction} onValueChange={(v) => set('gender_restriction', v as FormState['gender_restriction'])}>
                    <SelectTrigger id={id('gender')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{te('genderRestriction.all')}</SelectItem>
                      <SelectItem value="male">{te('genderRestriction.male')}</SelectItem>
                      <SelectItem value="female">{te('genderRestriction.female')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={t('types.fields.defaultEntitlement')}
                  htmlFor={id('entitlement')}
                  required
                  error={errors.default_entitlement}
                  hint={form.deducts_balance ? t('types.form.entitlementHint') : t('types.form.entitlementIgnored')}
                >
                  <Input
                    id={id('entitlement')}
                    type="number"
                    min={0}
                    max={365}
                    step={0.5}
                    dir="ltr"
                    className="numeric"
                    value={form.default_entitlement}
                    onChange={(e) => set('default_entitlement', e.target.value)}
                    aria-invalid={Boolean(errors.default_entitlement) || undefined}
                  />
                </Field>
                <Field label={t('types.fields.maxDays')} htmlFor={id('max')} error={errors.max_days_per_request} hint={t('types.form.maxDaysHint')}>
                  <Input
                    id={id('max')}
                    type="number"
                    min={0.5}
                    max={365}
                    step={0.5}
                    dir="ltr"
                    className="numeric"
                    value={form.max_days_per_request}
                    onChange={(e) => set('max_days_per_request', e.target.value)}
                    placeholder={t('types.form.noLimit')}
                    aria-invalid={Boolean(errors.max_days_per_request) || undefined}
                  />
                </Field>
                <Field label={t('types.fields.sortOrder')} htmlFor={id('sort')}>
                  <Input id={id('sort')} type="number" min={0} step={10} dir="ltr" className="numeric" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <SwitchRow id={id('paid')} label={t('types.fields.paid')} hint={t('types.form.paidHint')} checked={form.is_paid} onChange={(v) => set('is_paid', v)} />
                <SwitchRow id={id('deducts')} label={t('types.fields.deducts')} hint={t('types.form.deductsHint')} checked={form.deducts_balance} onChange={(v) => set('deducts_balance', v)} />
                <SwitchRow id={id('attachment')} label={t('types.fields.attachment')} hint={t('types.form.attachmentHint')} checked={form.requires_attachment} onChange={(v) => set('requires_attachment', v)} />
                <SwitchRow id={id('active')} label={tc('active')} hint={t('types.form.activeHint')} checked={form.is_active} onChange={(v) => set('is_active', v)} />
              </div>
            </section>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form={id('form')} loading={pending}>
            {row ? tc('saveChanges') : t('types.add')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Leave types master data (settings pattern): used by /settings/leave-types and the Leave Types tab
 * of /leave. Read-only unless `canEdit` (settings.edit or leave.administer, organization-scoped).
 * With `page` (the settings route) it renders the master-data page header — Import + Add in the
 * header, KPIs below it, Export in the table toolbar — like departments / job titles; inside the
 * /leave tab the Add button stays in the table toolbar.
 */
export function LeaveTypesManager({
  rows,
  canEdit,
  canExport = false,
  page,
}: {
  rows: LeaveTypeRow[];
  canEdit: boolean;
  canExport?: boolean;
  page?: { title: string; description: string; kpis?: ReactNode };
}) {
  const t = useTranslations('leave');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const locale = useLocale() as Locale;
  const resolveError = useErrorMessage();
  const router = useRouter();
  const [sheet, setSheet] = useState<{ open: boolean; row: LeaveTypeRow | null }>({ open: false, row: null });
  const [confirmDelete, setConfirmDelete] = useState<LeaveTypeRow | null>(null);
  const [, startTransition] = useTransition();
  const nextSort = rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;

  const toggleActive = (row: LeaveTypeRow) =>
    startTransition(async () => {
      const result = await setLeaveTypeActive({ id: row.id, active: !row.is_active });
      if (result.ok) {
        toast.success(t(row.is_active ? 'types.toast.deactivated' : 'types.toast.activated'));
        router.refresh();
      } else toast.error(resolveError(result.error));
    });

  const columns = useMemo<ColumnDef<LeaveTypeRow>[]>(() => {
    const yes = <CheckIcon className="size-4 text-success" aria-label={tc('yes')} />;
    const no = <span className="text-faint-foreground">—</span>;
    return [
      {
        id: 'name',
        accessorFn: (r) => localized(r, 'name', locale),
        header: ({ column }) => <SortHeader column={column} title={tc('name')} />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <LeaveTypeDot color={row.original.color} className="size-3" />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-medium text-foreground">{localized(row.original, 'name', locale)}</div>
              <bdi className="font-mono text-xs text-muted-foreground">{row.original.code}</bdi>
            </div>
          </div>
        ),
        meta: { label: tc('name'), width: '15rem' },
        enableHiding: false,
      },
      {
        id: 'other_name',
        accessorFn: (r) => (locale === 'ar' ? r.name_en : r.name_ar),
        header: () => (locale === 'ar' ? tc('nameEn') : tc('nameAr')),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
        enableSorting: false,
        meta: { label: locale === 'ar' ? tc('nameEn') : tc('nameAr'), defaultHidden: true },
      },
      {
        id: 'default_entitlement',
        accessorFn: (r) => (r.deducts_balance ? r.default_entitlement : -1),
        header: ({ column }) => <SortHeader column={column} title={t('types.fields.balance')} />,
        cell: ({ row }) =>
          row.original.deducts_balance ? (
            <div className="flex items-center gap-2">
              <Badge variant="default" size="sm">
                <WalletCardsIcon />
                {t('types.deducts')}
              </Badge>
              <span className="text-meta font-medium numeric">{t('types.perYear', { count: row.original.default_entitlement })}</span>
            </div>
          ) : (
            <span className="text-meta text-muted-foreground">{t('types.noDeduct')}</span>
          ),
        meta: { label: t('types.fields.balance') },
      },
      {
        id: 'max_days_per_request',
        accessorKey: 'max_days_per_request',
        header: () => t('types.fields.maxDays'),
        cell: ({ row }) => (row.original.max_days_per_request != null ? <span className="numeric">{formatDays(row.original.max_days_per_request, locale)}</span> : no),
        enableSorting: false,
        meta: { label: t('types.fields.maxDays'), align: 'end', headerClassName: 'whitespace-nowrap' },
      },
      {
        id: 'day_count_basis',
        accessorKey: 'day_count_basis',
        header: () => t('types.fields.basis'),
        cell: ({ row }) => <span className="text-meta">{te(`dayCountBasis.${row.original.day_count_basis}`)}</span>,
        enableSorting: false,
        meta: { label: t('types.fields.basis') },
      },
      {
        id: 'is_paid',
        accessorKey: 'is_paid',
        header: () => t('types.fields.paid'),
        cell: ({ row }) => (row.original.is_paid ? yes : no),
        enableSorting: false,
        meta: { label: t('types.fields.paid'), align: 'center', width: '5rem' },
      },
      {
        id: 'requires_attachment',
        accessorKey: 'requires_attachment',
        header: () => t('types.fields.attachmentShort'),
        cell: ({ row }) => (row.original.requires_attachment ? <PaperclipIcon className="mx-auto size-4 text-muted-foreground" aria-label={tc('yes')} /> : no),
        enableSorting: false,
        meta: { label: t('types.fields.attachment'), align: 'center', width: '6rem' },
      },
      {
        id: 'gender_restriction',
        accessorKey: 'gender_restriction',
        header: () => t('types.fields.gender'),
        cell: ({ row }) => (
          <span className={cn('text-meta', !row.original.gender_restriction && 'text-muted-foreground')}>
            {te(`genderRestriction.${row.original.gender_restriction ?? 'all'}`)}
          </span>
        ),
        enableSorting: false,
        meta: { label: t('types.fields.gender'), defaultHidden: true },
      },
      {
        id: 'sort_order',
        accessorKey: 'sort_order',
        header: ({ column }) => <SortHeader column={column} title={t('types.fields.sortOrder')} />,
        cell: ({ row }) => <span className="numeric text-muted-foreground">{row.original.sort_order}</span>,
        meta: { label: t('types.fields.sortOrder'), align: 'end', width: '5rem', defaultHidden: true },
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
            actionsColumn<LeaveTypeRow>((row) => [
              { label: tc('edit'), icon: PencilIcon, onSelect: () => setSheet({ open: true, row }) },
              {
                label: row.is_active ? tc('deactivate') : tc('activate'),
                icon: row.is_active ? CircleOffIcon : CirclePowerIcon,
                onSelect: () => toggleActive(row),
              },
              { label: tc('delete'), icon: Trash2Icon, variant: 'destructive', separatorBefore: true, onSelect: () => setConfirmDelete(row) },
            ]),
          ]
        : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleActive is stable enough (transition + router).
  }, [t, tc, te, locale, canEdit]);

  const filters: FilterDef<LeaveTypeRow>[] = [
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
    {
      key: 'deducts',
      title: t('types.fields.deducts'),
      icon: WalletCardsIcon,
      options: [
        { value: 'yes', label: t('types.deducts') },
        { value: 'no', label: t('types.noDeduct') },
      ],
      accessor: (r) => (r.deducts_balance ? 'yes' : 'no'),
    },
  ];

  const addButton = canEdit ? (
    <Button size="sm" onClick={() => setSheet({ open: true, row: null })}>
      <PlusIcon />
      {t('types.add')}
    </Button>
  ) : null;

  // Settings page header (master-data pattern). Leave types have no import template (each type
  // carries balance and request rules), so Import is shown disabled with the reason.
  const header = page ? (
    <PageHeader
      compact
      title={page.title}
      description={page.description}
      actions={
        <>
          <SimpleTooltip content={t('types.importUnavailable')}>
            <span tabIndex={0}>
              <Button variant="outline" disabled>
                <UploadIcon />
                {tc('import')}
              </Button>
            </span>
          </SimpleTooltip>
          {canEdit ? (
            <Button onClick={() => setSheet({ open: true, row: null })}>
              <PlusIcon />
              {t('types.add')}
            </Button>
          ) : (
            <SimpleTooltip content={t('types.readOnly')}>
              <span tabIndex={0}>
                <Button disabled>
                  <PlusIcon />
                  {t('types.add')}
                </Button>
              </span>
            </SimpleTooltip>
          )}
        </>
      }
    />
  ) : null;

  return (
    <>
      {header}
      {page?.kpis}
      <DataTable
        tableId="leave-types"
        mode="client"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={canEdit ? (r) => setSheet({ open: true, row: r }) : undefined}
        filters={filters}
        searchPlaceholder={t('types.searchPlaceholder')}
        searchText={(r) => `${r.name_ar} ${r.name_en} ${r.code}`}
        toolbarActions={page ? undefined : addButton}
        exportDataset={canExport ? 'leave_types' : undefined}
        defaultSort={{ id: 'sort_order', desc: false }}
        defaultPageSize={25}
        maxHeight="none"
        emptyState={{ icon: TagsIcon, title: t('types.emptyTitle'), description: t('types.emptyDescription'), action: canEdit ? addButton : undefined }}
        renderMobileCard={(r) => (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <LeaveTypeDot color={r.color} className="size-3" />
              <div className="min-w-0 leading-tight">
                <div className="truncate font-medium">{localized(r, 'name', locale)}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {te(`dayCountBasis.${r.day_count_basis}`)}
                  {r.deducts_balance ? ` · ${t('types.entitlementDays', { count: r.default_entitlement })}` : ''}
                </div>
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
      {canEdit ? (
        <>
          <LeaveTypeSheet open={sheet.open} row={sheet.row} nextSort={nextSort} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} />
          <ConfirmDialog
            open={Boolean(confirmDelete)}
            onOpenChange={(o) => !o && setConfirmDelete(null)}
            variant="danger"
            title={t('types.deleteTitle')}
            description={t('types.deleteDescription', { name: confirmDelete ? localized(confirmDelete, 'name', locale) : '' })}
            confirmLabel={tc('delete')}
            onConfirm={async () => {
              if (!confirmDelete) return;
              const result = await deleteLeaveType({ id: confirmDelete.id });
              if (!result.ok) {
                toast.error(resolveError(result.error));
                return false;
              }
              toast.success(t('types.toast.deleted'));
              router.refresh();
            }}
          />
        </>
      ) : null}
    </>
  );
}
