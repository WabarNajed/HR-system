'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, ShieldPlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import { useForm, useFormContext, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import { actionsColumn, DataTable } from '@/components/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DatePicker } from '@/components/shared/date-picker';
import { FormFullRow, FormGrid } from '@/components/shared/form-section';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { ActionResult } from '@/lib/action';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { deleteInsurance, saveInsurance } from '../../actions';
import { EMPTY_INSURANCE_FORM, insuranceFormSchema, type InsuranceFormValues } from '../../schemas';
import { INSURANCE_STATUSES, type DependentRecord, type InsuranceRecord, type RELATIONSHIPS } from '../../types';
import { ExpiryBadge } from '../expiry-badge';
import { MobileCardShell } from './profile-parts';
import { LiftToasts } from '../lift-toasts';

type Relationship = (typeof RELATIONSHIPS)[number];

function toFormValues(p: InsuranceRecord): InsuranceFormValues {
  const s = (v: string | null) => v ?? '';
  return {
    dependent_id: s(p.dependent_id),
    provider: s(p.provider),
    policy_number: s(p.policy_number),
    class: s(p.class),
    member_number: s(p.member_number),
    start_date: s(p.start_date),
    expiry_date: s(p.expiry_date),
    status: (INSURANCE_STATUSES as readonly string[]).includes(p.status) ? (p.status as InsuranceFormValues['status']) : 'active',
  };
}

export function InsuranceManager({
  employeeId,
  employeeName,
  policies,
  dependents,
  canEdit,
  canCreate = canEdit,
  today,
}: {
  employeeId: string;
  employeeName: string;
  policies: InsuranceRecord[];
  dependents: DependentRecord[];
  /** Update/delete (org `edit`). */
  canEdit: boolean;
  /** Add (org `create` or `edit`); defaults to `canEdit`. */
  canCreate?: boolean;
  today: string;
}) {
  const t = useTranslations('employees.insurance');
  const te = useTranslations('enums');
  const locale = useLocale();
  const fmt = useDateFormat();
  const resolve = useErrorMessage();
  const router = useRouter();
  const [editing, setEditing] = useState<InsuranceRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<InsuranceRecord | null>(null);
  const byId = useMemo(() => new Map(dependents.map((d) => [d.id, d])), [dependents]);

  const columns = useMemo<ColumnDef<InsuranceRecord>[]>(() => {
    const dash = <span className="text-faint-foreground">—</span>;
    const cols: ColumnDef<InsuranceRecord>[] = [
      {
        id: 'insured',
        enableSorting: false,
        header: () => t('fields.insured'),
        meta: { label: t('fields.insured'), width: '14rem' },
        cell: ({ row }) => {
          const dep = row.original.dependent_id ? byId.get(row.original.dependent_id) : null;
          return (
            <div className="max-w-[16rem] min-w-0 leading-tight">
              <div className="truncate font-medium text-foreground" title={dep ? employeeDisplayName(dep, locale) : employeeName}>
                {dep ? employeeDisplayName(dep, locale) : row.original.dependent_id ? t('dependentsGroup') : employeeName}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {dep ? te(`relationship.${dep.relationship as Relationship}`) : row.original.dependent_id ? '—' : t('fields.self')}
              </div>
            </div>
          );
        },
      },
      {
        id: 'provider',
        enableSorting: false,
        header: () => t('fields.provider'),
        meta: { label: t('fields.provider') },
        cell: ({ row }) => (
          <div className="min-w-0 leading-tight">
            <div className="truncate">{row.original.provider || '—'}</div>
            {row.original.class ? <div className="mt-0.5 text-xs text-muted-foreground">{t('fields.class')}: {row.original.class}</div> : null}
          </div>
        ),
      },
      {
        id: 'policy',
        enableSorting: false,
        header: () => t('fields.policyNumber'),
        meta: { label: t('fields.policyNumber') },
        cell: ({ row }) => (
          <div className="leading-tight">
            <div>{row.original.policy_number ? <bdi dir="ltr" className="tabular-nums">{row.original.policy_number}</bdi> : dash}</div>
            {row.original.member_number ? (
              <div className="mt-0.5 text-xs text-muted-foreground">
                <bdi dir="ltr" className="tabular-nums">
                  {row.original.member_number}
                </bdi>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'coverage',
        enableSorting: false,
        header: () => t('fields.coverage'),
        meta: { label: t('fields.coverage') },
        cell: ({ row }) =>
          row.original.start_date || row.original.expiry_date ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{fmt.range(row.original.start_date, row.original.expiry_date)}</span>
              {row.original.status === 'active' ? <ExpiryBadge date={row.original.expiry_date} today={today} hideValid /> : null}
            </div>
          ) : (
            dash
          ),
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => t('fields.status'),
        meta: { label: t('fields.status') },
        cell: ({ row }) => <StatusBadge domain="insurance" status={row.original.status} size="sm" />,
      },
    ];
    if (canEdit) {
      cols.push(
        actionsColumn<InsuranceRecord>((p) => [
          { label: t('editTitle'), icon: PencilIcon, onSelect: () => setEditing(p) },
          { label: t('deleteConfirm'), icon: Trash2Icon, variant: 'destructive', separatorBefore: true, onSelect: () => setDeleting(p) },
        ]),
      );
    }
    return cols;
  }, [t, te, locale, fmt, today, canEdit, byId, employeeName]);

  return (
    <SectionCard
      title={t('title')}
      description={t('description')}
      icon={<ShieldPlusIcon />}
      flush
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setEditing('new')}>
            <PlusIcon />
            {t('add')}
          </Button>
        ) : null
      }
    >
      <DataTable<InsuranceRecord>
        tableId="employee-insurance"
        mode="client"
        columns={columns}
        data={policies}
        getRowId={(p) => p.id}
        toolbar={false}
        pagination={false}
        maxHeight="none"
        onRowClick={canEdit ? (p) => setEditing(p) : undefined}
        className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none"
        emptyState={{
          icon: ShieldPlusIcon,
          title: t('emptyTitle'),
          description: t('emptyDescription'),
          action: canCreate ? (
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              <PlusIcon />
              {t('add')}
            </Button>
          ) : undefined,
        }}
        renderMobileCard={(p) => {
          const dep = p.dependent_id ? byId.get(p.dependent_id) : null;
          return (
            <MobileCardShell onOpen={canEdit ? () => setEditing(p) : undefined}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {dep ? employeeDisplayName(dep, locale) : p.dependent_id ? t('dependentsGroup') : employeeName}
                </span>
                <StatusBadge domain="insurance" status={p.status} size="sm" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{[p.provider, p.class].filter(Boolean).join(' · ')}</span>
                {p.expiry_date ? <span className="tabular-nums">{fmt.date(p.expiry_date)}</span> : null}
                {p.status === 'active' ? <ExpiryBadge date={p.expiry_date} today={today} hideValid /> : null}
              </div>
            </MobileCardShell>
          );
        }}
      />

      {canEdit || canCreate ? (
        <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
          <SheetContent side="end" className="sm:max-w-xl">
          <LiftToasts />
            <SheetHeader>
              <SheetTitle>{editing === 'new' ? t('addTitle') : t('editTitle')}</SheetTitle>
              <SheetDescription>{t('sheetDescription')}</SheetDescription>
            </SheetHeader>
            {editing ? (
              <InsuranceForm
                key={editing === 'new' ? 'new' : editing.id}
                employeeId={employeeId}
                employeeName={employeeName}
                policyId={editing === 'new' ? null : editing.id}
                defaults={editing === 'new' ? EMPTY_INSURANCE_FORM : toFormValues(editing)}
                dependents={dependents}
                onCancel={() => setEditing(null)}
                onDelete={
                  editing === 'new'
                    ? undefined
                    : () => {
                        setDeleting(editing);
                        setEditing(null);
                      }
                }
                onSaved={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        variant="danger"
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('deleteConfirm')}
        onConfirm={async () => {
          if (!deleting) return;
          const result: ActionResult = await deleteInsurance({ employeeId, id: deleting.id }).catch(() => ({ ok: false, error: 'errors.generic' }));
          if (!result.ok) {
            toast.error(resolve(result.error));
            return false;
          }
          toast.success(resolve(result.message));
          router.refresh();
        }}
      />
    </SectionCard>
  );
}

function InsuranceForm({
  employeeId,
  employeeName,
  policyId,
  defaults,
  dependents,
  onCancel,
  onDelete,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  policyId: string | null;
  defaults: InsuranceFormValues;
  dependents: DependentRecord[];
  onCancel: () => void;
  /** Delete from the sheet (the only way on phones, where the row menu isn't shown). */
  onDelete?: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('employees.insurance');
  const te = useTranslations('enums');
  const ts = useTranslations('statuses.insurance');
  const tc = useTranslations('common');
  const tToast = useTranslations('employees.toast');
  const locale = useLocale();
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const form = useForm<InsuranceFormValues>({ resolver: zodResolver(insuranceFormSchema), defaultValues: defaults, mode: 'onTouched' });

  // Guards double submits in the gap before `pending` renders (the sheet closes on success).
  const submitting = useRef(false);
  const onValid = (values: InsuranceFormValues) =>
    startTransition(async () => {
      const result: ActionResult = await saveInsurance({ employeeId, id: policyId, values }).catch(() => ({
        ok: false,
        error: 'errors.generic',
      }));
      if (!result.ok) {
        submitting.current = false;
        for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(name.replace(/^values\./, '') as FieldPath<InsuranceFormValues>, { type: 'server', message });
        }
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      onSaved();
    });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (submitting.current) return;
    submitting.current = true;
    void form.handleSubmit(onValid, () => {
      submitting.current = false;
      toast.error(tToast('invalidForm'));
    })(event);
  };

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetBody>
          <FormGrid>
            <FormFullRow>
              <FormField
                control={form.control}
                name="dependent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('fields.insured')}</FormLabel>
                    <Select value={field.value || '__self'} onValueChange={(v) => field.onChange(v === '__self' ? '' : v)} disabled={pending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>{t('employeeGroup')}</SelectLabel>
                          <SelectItem value="__self">{employeeName}</SelectItem>
                        </SelectGroup>
                        {dependents.length ? (
                          <SelectGroup>
                            <SelectLabel>{t('dependentsGroup')}</SelectLabel>
                            {dependents.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {employeeDisplayName(d, locale)} · {te(`relationship.${d.relationship as Relationship}`)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ) : null}
                      </SelectContent>
                    </Select>
                    {!dependents.length ? <FormDescription>{t('noDependentsHint')}</FormDescription> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormFullRow>
            <Text name="provider" label={t('fields.provider')} disabled={pending} />
            <Text name="policy_number" label={t('fields.policyNumber')} dir="ltr" disabled={pending} />
            <Text name="class" label={t('fields.class')} disabled={pending} />
            <Text name="member_number" label={t('fields.memberNumber')} dir="ltr" disabled={pending} />
            <DateInput name="start_date" label={t('fields.startDate')} disabled={pending} />
            <DateInput name="expiry_date" label={t('fields.expiryDate')} disabled={pending} />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('fields.status')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INSURANCE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {ts(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormGrid>
        </SheetBody>
        <SheetFooter>
          {onDelete ? (
            <Button type="button" variant="ghost" onClick={onDelete} disabled={pending} className="me-auto text-danger hover:bg-danger-soft hover:text-danger">
              <Trash2Icon />
              {t('deleteConfirm')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={pending} className="min-w-24">
            {pending ? tc('saving') : tc('save')}
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}

function Text({ name, label, dir, disabled }: { name: FieldPath<InsuranceFormValues>; label: string; dir?: 'ltr' | 'rtl'; disabled?: boolean }) {
  const { control } = useFormContext<InsuranceFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} dir={dir} disabled={disabled} autoComplete="off" className="text-start" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function DateInput({ name, label, disabled }: { name: FieldPath<InsuranceFormValues>; label: string; disabled?: boolean }) {
  const { control } = useFormContext<InsuranceFormValues>();
  const t = useTranslations('employees.form.placeholders');
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <DatePicker
              value={field.value || null}
              onChange={(v) => {
                field.onChange(v ?? '');
                field.onBlur();
              }}
              placeholder={t('date')}
              disabled={disabled}
              captionLayout="dropdown"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
