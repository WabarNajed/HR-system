'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { HeartHandshakeIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState, useTransition, type ReactNode, type FormEvent } from 'react';
import { useForm, useFormContext, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import { actionsColumn, DataTable } from '@/components/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DatePicker } from '@/components/shared/date-picker';
import { FormFullRow, FormGrid } from '@/components/shared/form-section';
import { SectionCard } from '@/components/shared/section-card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/action';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { employeeAlternateName, employeeDisplayName } from '@/lib/i18n/localized';
import { deleteDependent, saveDependent } from '../../actions';
import { dependentFormSchema, EMPTY_DEPENDENT_FORM, type DependentFormValues } from '../../schemas';
import { DEPENDENT_INSURANCE_STATUSES, RELATIONSHIPS, type DependentRecord } from '../../types';
import { ExpiryBadge } from '../expiry-badge';
import { LiftToasts } from '../lift-toasts';
import { ageFrom, MobileCardShell } from './profile-parts';

const INSURANCE_TONE: Record<string, BadgeVariant> = { insured: 'success', not_insured: 'neutral', pending: 'warning' };

function toFormValues(d: DependentRecord): DependentFormValues {
  const s = (v: string | null) => v ?? '';
  return {
    name_ar: s(d.name_ar),
    name_en: s(d.name_en),
    relationship: (RELATIONSHIPS as readonly string[]).includes(d.relationship) ? (d.relationship as DependentFormValues['relationship']) : 'other',
    date_of_birth: s(d.date_of_birth),
    nationality: s(d.nationality),
    national_id: s(d.national_id),
    iqama_expiry_date: s(d.iqama_expiry_date),
    passport_number: s(d.passport_number),
    passport_expiry_date: s(d.passport_expiry_date),
    insurance_status: (DEPENDENT_INSURANCE_STATUSES as readonly string[]).includes(d.insurance_status ?? '')
      ? (d.insurance_status as DependentFormValues['insurance_status'])
      : '',
    insurance_member_number: s(d.insurance_member_number),
    notes: s(d.notes),
  };
}

export function DependentsManager({
  employeeId,
  dependents,
  canEdit,
  canCreate = canEdit,
  today,
}: {
  employeeId: string;
  dependents: DependentRecord[];
  /** Update/delete (org `edit`). */
  canEdit: boolean;
  /** Add (org `create` or `edit`); defaults to `canEdit`. */
  canCreate?: boolean;
  today: string;
}) {
  const t = useTranslations('employees.dependents');
  const te = useTranslations('enums');
  const tf = useTranslations('employees.fields');
  const tc = useTranslations('common');
  const locale = useLocale();
  const fmt = useDateFormat();
  const resolve = useErrorMessage();
  const router = useRouter();
  const [editing, setEditing] = useState<DependentRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DependentRecord | null>(null);

  const columns = useMemo<ColumnDef<DependentRecord>[]>(() => {
    const dash = <span className="text-faint-foreground">—</span>;
    const cols: ColumnDef<DependentRecord>[] = [
      {
        id: 'name',
        header: () => tc('name'),
        meta: { label: tc('name'), width: '15rem' },
        enableSorting: false,
        cell: ({ row }) => {
          const d = row.original;
          const alt = employeeAlternateName(d, locale);
          return (
            <div className="max-w-[18rem] min-w-0 leading-tight">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-foreground" title={employeeDisplayName(d, locale)}>
                  {employeeDisplayName(d, locale)}
                </span>
                <Badge variant="secondary" size="sm">
                  {te(`relationship.${d.relationship as (typeof RELATIONSHIPS)[number]}`)}
                </Badge>
              </div>
              {alt ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{alt}</div> : null}
            </div>
          );
        },
      },
      {
        id: 'dob',
        enableSorting: false,
        header: () => t('fields.dateOfBirth'),
        meta: { label: t('fields.dateOfBirth') },
        cell: ({ row }) => {
          const dob = row.original.date_of_birth;
          if (!dob) return dash;
          const age = ageFrom(dob, today);
          return (
            <div className="leading-tight">
              <div className="tabular-nums">{fmt.date(dob)}</div>
              {age !== null ? <div className="text-xs text-muted-foreground">{tf('age', { count: age })}</div> : null}
            </div>
          );
        },
      },
      {
        id: 'national_id',
        enableSorting: false,
        header: () => t('fields.idNumber'),
        meta: { label: t('fields.idNumber') },
        cell: ({ row }) => (row.original.national_id ? <bdi dir="ltr" className="tabular-nums">{row.original.national_id}</bdi> : dash),
      },
      {
        id: 'iqama_expiry',
        enableSorting: false,
        header: () => t('fields.iqamaExpiry'),
        meta: { label: t('fields.iqamaExpiry') },
        cell: ({ row }) =>
          row.original.iqama_expiry_date ? (
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{fmt.date(row.original.iqama_expiry_date)}</span>
              <ExpiryBadge date={row.original.iqama_expiry_date} today={today} hideValid />
            </div>
          ) : (
            dash
          ),
      },
      {
        id: 'passport',
        enableSorting: false,
        header: () => t('fields.passportExpiry'),
        meta: { label: t('fields.passportExpiry') },
        cell: ({ row }) =>
          row.original.passport_expiry_date ? (
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{fmt.date(row.original.passport_expiry_date)}</span>
              <ExpiryBadge date={row.original.passport_expiry_date} today={today} hideValid />
            </div>
          ) : (
            dash
          ),
      },
      {
        id: 'insurance',
        enableSorting: false,
        header: () => t('fields.insuranceStatus'),
        meta: { label: t('fields.insuranceStatus') },
        cell: ({ row }) => {
          const s = row.original.insurance_status;
          const member = row.original.insurance_member_number;
          if (!s && !member) return dash;
          return (
            <div className="leading-tight">
              {s ? (
                <Badge variant={INSURANCE_TONE[s] ?? 'neutral'} size="sm" dot>
                  {te(`insuranceStatus.${s as (typeof DEPENDENT_INSURANCE_STATUSES)[number]}`)}
                </Badge>
              ) : null}
              {member ? (
                <div className={s ? 'mt-1 text-xs text-muted-foreground' : 'text-sm'}>
                  <bdi dir="ltr" className="tabular-nums">
                    {member}
                  </bdi>
                </div>
              ) : null}
            </div>
          );
        },
      },
    ];
    if (canEdit) {
      cols.push(
        actionsColumn<DependentRecord>((d) => [
          { label: t('editTitle'), icon: PencilIcon, onSelect: () => setEditing(d) },
          { label: t('deleteConfirm'), icon: Trash2Icon, variant: 'destructive', separatorBefore: true, onSelect: () => setDeleting(d) },
        ]),
      );
    }
    return cols;
  }, [t, te, tf, tc, locale, fmt, today, canEdit]);

  return (
    <SectionCard
      title={t('title')}
      description={t('description')}
      icon={<HeartHandshakeIcon />}
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
      <DataTable<DependentRecord>
        tableId="employee-dependents"
        mode="client"
        columns={columns}
        data={dependents}
        getRowId={(d) => d.id}
        toolbar={false}
        pagination={false}
        maxHeight="none"
        onRowClick={canEdit ? (d) => setEditing(d) : undefined}
        className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none"
        emptyState={{
          icon: HeartHandshakeIcon,
          title: t('emptyTitle'),
          description: t('emptyDescription'),
          action: canCreate ? (
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              <PlusIcon />
              {t('add')}
            </Button>
          ) : undefined,
        }}
        renderMobileCard={(d) => (
          <MobileCardShell onOpen={canEdit ? () => setEditing(d) : undefined}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-foreground">{employeeDisplayName(d, locale)}</span>
              <Badge variant="secondary" size="sm">
                {te(`relationship.${d.relationship as (typeof RELATIONSHIPS)[number]}`)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {d.date_of_birth ? <span className="tabular-nums">{fmt.date(d.date_of_birth)}</span> : null}
              <ExpiryBadge date={d.iqama_expiry_date} today={today} hideValid />
              {d.insurance_status ? (
                <Badge variant={INSURANCE_TONE[d.insurance_status] ?? 'neutral'} size="sm" dot>
                  {te(`insuranceStatus.${d.insurance_status as (typeof DEPENDENT_INSURANCE_STATUSES)[number]}`)}
                </Badge>
              ) : null}
            </div>
          </MobileCardShell>
        )}
      />

      {canEdit || canCreate ? (
        <DependentSheet
          employeeId={employeeId}
          target={editing}
          onClose={() => setEditing(null)}
          onDelete={(d) => {
            setEditing(null);
            setDeleting(d);
          }}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        variant="danger"
        title={deleting ? t('deleteTitle', { name: employeeDisplayName(deleting, locale) }) : ''}
        description={t('deleteDescription')}
        confirmLabel={t('deleteConfirm')}
        onConfirm={async () => {
          if (!deleting) return;
          const result: ActionResult = await deleteDependent({ employeeId, id: deleting.id }).catch(() => ({ ok: false, error: 'errors.generic' }));
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

function DependentSheet({
  employeeId,
  target,
  onClose,
  onDelete,
  onSaved,
}: {
  employeeId: string;
  target: DependentRecord | 'new' | null;
  onClose: () => void;
  /** Delete from the sheet (the only way on phones, where the row menu isn't shown). */
  onDelete: (dependent: DependentRecord) => void;
  onSaved: () => void;
}) {
  const t = useTranslations('employees.dependents');
  return (
    <Sheet open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="end" className="sm:max-w-xl">
          <LiftToasts />
        <SheetHeader>
          <SheetTitle>{target === 'new' ? t('addTitle') : t('editTitle')}</SheetTitle>
          <SheetDescription>{t('sheetDescription')}</SheetDescription>
        </SheetHeader>
        {target ? (
          <DependentForm
            key={target === 'new' ? 'new' : target.id}
            employeeId={employeeId}
            dependentId={target === 'new' ? null : target.id}
            defaults={target === 'new' ? EMPTY_DEPENDENT_FORM : toFormValues(target)}
            onCancel={onClose}
            onDelete={target === 'new' ? undefined : () => onDelete(target)}
            onSaved={onSaved}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DependentForm({
  employeeId,
  dependentId,
  defaults,
  onCancel,
  onDelete,
  onSaved,
}: {
  employeeId: string;
  dependentId: string | null;
  defaults: DependentFormValues;
  onCancel: () => void;
  onDelete?: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('employees');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const form = useForm<DependentFormValues>({ resolver: zodResolver(dependentFormSchema), defaultValues: defaults, mode: 'onTouched' });

  // Guards double submits in the gap before `pending` renders (the sheet closes on success).
  const submitting = useRef(false);
  const onValid = (values: DependentFormValues) =>
    startTransition(async () => {
      const result: ActionResult = await saveDependent({ employeeId, id: dependentId, values }).catch(() => ({
        ok: false,
        error: 'errors.generic',
      }));
      if (!result.ok) {
        submitting.current = false;
        for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(name.replace(/^values\./, '') as FieldPath<DependentFormValues>, { type: 'server', message });
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
      toast.error(t('toast.invalidForm'));
    })(event);
  };

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetBody className="flex flex-col gap-6">
          <Group title={t('dependents.sections.personal')}>
            <FormGrid>
              <Text name="name_ar" label={t('fields.nameAr')} dir="rtl" disabled={pending} description={t('form.hints.nameEither')} />
              <Text name="name_en" label={t('fields.nameEn')} dir="ltr" disabled={pending} />
              <FormField
                control={form.control}
                name="relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('dependents.fields.relationship')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RELATIONSHIPS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {te(`relationship.${r}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DateInput name="date_of_birth" label={t('dependents.fields.dateOfBirth')} disabled={pending} />
              <Text name="nationality" label={t('dependents.fields.nationality')} disabled={pending} />
            </FormGrid>
          </Group>
          <Group title={t('dependents.sections.documents')}>
            <FormGrid>
              <Text name="national_id" label={t('dependents.fields.idNumber')} dir="ltr" disabled={pending} />
              <DateInput name="iqama_expiry_date" label={t('dependents.fields.iqamaExpiry')} disabled={pending} />
              <Text name="passport_number" label={t('dependents.fields.passportNumber')} dir="ltr" disabled={pending} />
              <DateInput name="passport_expiry_date" label={t('dependents.fields.passportExpiry')} disabled={pending} />
            </FormGrid>
          </Group>
          <Group title={t('dependents.sections.insurance')}>
            <FormGrid>
              <FormField
                control={form.control}
                name="insurance_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dependents.fields.insuranceStatus')}</FormLabel>
                    <Select value={field.value || '__none'} onValueChange={(v) => field.onChange(v === '__none' ? '' : v)} disabled={pending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none">
                          <span className="text-muted-foreground">{t('form.none')}</span>
                        </SelectItem>
                        {DEPENDENT_INSURANCE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {te(`insuranceStatus.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Text name="insurance_member_number" label={t('dependents.fields.memberNumber')} dir="ltr" disabled={pending} />
              <FormFullRow>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('dependents.fields.notes')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormFullRow>
            </FormGrid>
          </Group>
        </SheetBody>
        <SheetFooter>
          {onDelete ? (
            <Button type="button" variant="ghost" onClick={onDelete} disabled={pending} className="me-auto text-danger hover:bg-danger-soft hover:text-danger">
              <Trash2Icon />
              {t('dependents.deleteConfirm')}
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Text({
  name,
  label,
  dir,
  disabled,
  required,
  description,
}: {
  name: FieldPath<DependentFormValues>;
  label: string;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
  required?: boolean;
  description?: string;
}) {
  const { control } = useFormContext<DependentFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel required={required}>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} dir={dir} disabled={disabled} autoComplete="off" className="text-start" />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function DateInput({ name, label, disabled }: { name: FieldPath<DependentFormValues>; label: string; disabled?: boolean }) {
  const { control } = useFormContext<DependentFormValues>();
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

