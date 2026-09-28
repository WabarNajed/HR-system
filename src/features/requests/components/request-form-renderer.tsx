'use client';

import { CheckIcon, DownloadIcon, FileTextIcon, LockIcon, PaperclipIcon, Trash2Icon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { DatePicker } from '@/components/shared/date-picker';
import { FileDropzone, fileKey, type DropzoneFileState } from '@/components/shared/file-dropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { InputGroup } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatIban, formatNumber } from '@/lib/format';
import { intlLocale, type Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { fileRouteUrl, UPLOAD_LIMITS } from '@/lib/storage';
import { cn, fileSizeParts } from '@/lib/utils';
import { loadRequestLookups, searchEmployees } from '../actions';
import { ATTACHMENT_ACCEPT } from '../constants';
import { attachmentsFor, isEmptyValue, isReadonlyField, visibleFields } from '../form-logic';
import type { AttachmentItem, EmployeeOption, FieldOption, FormLookups, RequestField } from '../types';

export type RequestFormRendererContext = {
  /** Employee the request is for (dependents, leave-type gender rules). */
  employeeId?: string;
  /** Prefetched lookups (read view / wizard); loaded lazily through a server action otherwise. */
  lookups?: FormLookups;
  /** Values for computed read-only fields (e.g. `{ days: '5 working days' }`). */
  computed?: Record<string, ReactNode>;
  /** Per-file upload state for pending attachments (keyed by `fileKey(file)`). */
  uploadStates?: Record<string, DropzoneFileState>;
  /** Deletes a stored attachment; resolve `false` to keep it in the list. */
  onRemoveAttachment?: (item: AttachmentItem & { kind: 'existing' }) => Promise<boolean>;
  /** Disables every input (e.g. while saving). */
  disabled?: boolean;
  /** Attachments allowed for this type (default true). */
  allowAttachments?: boolean;
};

export type RequestFormRendererProps = {
  fields: RequestField[];
  values: Record<string, unknown>;
  onChange?: (key: string, value: unknown) => void;
  /** Field key → i18n key (`validation.required`, `validation.min|{"min":1}` …). */
  errors?: Record<string, string>;
  readOnly?: boolean;
  context?: RequestFormRendererContext;
  /** Columns at ≥ md (default 2). */
  columns?: 1 | 2;
  className?: string;
};

const FULL_WIDTH: ReadonlySet<string> = new Set(['long_text', 'multi_select', 'attachment']);

/**
 * Dynamic request form (DATABASE.md §10). One renderer powers the New Request wizard, the
 * returned-request editor, the details read view and the Form Builder preview. Only fields whose
 * visibility rule holds are shown; labels, help, placeholders and options are bilingual.
 */
export function RequestFormRenderer({ fields, values, onChange, errors, readOnly = false, context, columns = 2, className }: RequestFormRendererProps) {
  const locale = useLocale() as Locale;
  const lookups = useLookups(fields, context);
  const shown = useMemo(() => {
    const list = visibleFields(
      fields.filter((f) => f.is_active !== false || !isEmptyValue(values[f.key])),
      values,
    );
    if (!readOnly) return list;
    // Read view: only answered fields (plus computed values such as leave days).
    return list.filter((f) =>
      f.field_type === 'attachment'
        ? attachmentsFor(values[f.key]).length > 0
        : !isEmptyValue(values[f.key]) || context?.computed?.[f.key] !== undefined,
    );
  }, [fields, values, readOnly, context?.computed]);

  if (readOnly) {
    return <ReadOnlyFields fields={shown} values={values} lookups={lookups} computed={context?.computed} columns={columns} className={className} locale={locale} />;
  }

  const layout = gridLayout(shown, columns);
  return (
    <div className={cn('grid grid-cols-1 gap-x-5 gap-y-4', columns === 2 && 'md:grid-cols-2', className)} data-slot="request-form">
      {shown.map((field) => (
        <FieldShell
          key={field.key}
          field={field}
          error={errors?.[field.key]}
          full={layout.get(field.key)?.full ?? true}
          alignWithLabel={layout.get(field.key)?.offset ?? false}
          locale={locale}
        >
          {(id, describedBy) => (
            <FieldInput
              id={id}
              describedBy={describedBy}
              field={field}
              value={values[field.key]}
              onChange={(v) => onChange?.(field.key, v)}
              invalid={Boolean(errors?.[field.key])}
              lookups={lookups}
              context={context}
              locale={locale}
            />
          )}
        </FieldShell>
      ))}
    </div>
  );
}

/* ─── Lookups ─────────────────────────────────────────────────────────────── */

const lookupCache = new Map<string, Promise<FormLookups | null>>();

function useLookups(fields: RequestField[], context?: RequestFormRendererContext): FormLookups {
  const needs = fields.some((f) => f.field_type === 'leave_type' || f.field_type === 'dependent');
  const employeeId = context?.employeeId ?? '';
  const [loaded, setLoaded] = useState<{ key: string; data: FormLookups } | null>(null);
  const provided = context?.lookups;

  useEffect(() => {
    if (provided || !needs) return;
    let cancelled = false;
    let pending = lookupCache.get(employeeId);
    if (!pending) {
      pending = loadRequestLookups({ employeeId: employeeId || null }).then((r) => (r.ok && r.data ? r.data : null));
      lookupCache.set(employeeId, pending);
    }
    void pending.then((data) => {
      if (!cancelled && data) setLoaded({ key: employeeId, data });
      if (!data) lookupCache.delete(employeeId);
    });
    return () => {
      cancelled = true;
    };
  }, [provided, needs, employeeId]);

  return provided ?? (loaded?.key === employeeId ? loaded.data : { leaveTypes: [], dependents: [] });
}

/* ─── Layout shell ────────────────────────────────────────────────────────── */

/**
 * Two-column placement: full-width fields take a whole row; a Yes/No switch sharing a row with a
 * labelled input is offset by the label height so both boxes line up.
 */
function gridLayout(fields: RequestField[], columns: 1 | 2): Map<string, { full: boolean; offset: boolean }> {
  const out = new Map<string, { full: boolean; offset: boolean }>();
  const isFull = (f: RequestField) => columns === 1 || FULL_WIDTH.has(f.field_type) || isChoiceGrid(f);
  let col = 0;
  fields.forEach((f, i) => {
    if (isFull(f)) {
      out.set(f.key, { full: true, offset: false });
      col = 0;
      return;
    }
    const neighbour = col === 0 ? (fields[i + 1] && !isFull(fields[i + 1]!) ? fields[i + 1] : undefined) : fields[i - 1];
    out.set(f.key, { full: false, offset: f.field_type === 'yes_no' && Boolean(neighbour) && neighbour!.field_type !== 'yes_no' });
    col = col === 0 ? 1 : 0;
  });
  return out;
}

function isChoiceGrid(field: RequestField) {
  return field.key === 'subtype' && field.field_type === 'dropdown' && field.options.length > 1 && field.options.length <= 12;
}

function FieldShell({
  field,
  error,
  full,
  alignWithLabel,
  locale,
  children,
}: {
  field: RequestField;
  error?: string;
  full: boolean;
  alignWithLabel?: boolean;
  locale: Locale;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const t = useTranslations('requests.form');
  const resolve = useErrorMessage();
  const uid = useId();
  const id = `rf-${field.key}-${uid}`;
  const help = localized(field, 'help', locale);
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const readonly = isReadonlyField(field);
  const label = localized(field, 'label', locale);

  if (field.field_type === 'yes_no') {
    return (
      // Offset by the label height so the switch row lines up with the inputs beside it.
      <div className={cn('min-w-0', full && 'col-span-full', alignWithLabel && 'md:mt-[1.625rem]')} data-field={field.key}>
        {children(id, describedBy)}
        {error ? (
          <p id={errorId} className="mt-1.5 text-xs font-medium text-danger">
            {resolve(error)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', full && 'col-span-full')} data-field={field.key}>
      <Label htmlFor={id} className="gap-1">
        {label}
        {field.required && !readonly ? (
          <span aria-hidden className="text-danger">
            *
          </span>
        ) : null}
        {readonly ? <LockIcon className="size-3 text-faint-foreground" aria-hidden /> : null}
        {!field.required && !readonly ? <span className="text-xs font-normal text-faint-foreground">{t('optional')}</span> : null}
      </Label>
      {children(id, describedBy)}
      {help ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {resolve(error)}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Inputs ──────────────────────────────────────────────────────────────── */

type InputProps = {
  id: string;
  describedBy?: string;
  field: RequestField;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  lookups: FormLookups;
  context?: RequestFormRendererContext;
  locale: Locale;
};

function optionLabel(option: FieldOption, locale: Locale) {
  return localized(option, 'label', locale) || option.value;
}

function FieldInput(props: InputProps) {
  const { id, describedBy, field, value, onChange, invalid, lookups, context, locale } = props;
  const t = useTranslations('requests.form');
  const tc = useTranslations('common');
  const disabled = context?.disabled;
  const placeholder = localized(field, 'placeholder', locale) || undefined;
  const aria = { 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy };
  const str = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

  if (isReadonlyField(field)) {
    const computed = context?.computed?.[field.key];
    return (
      <div
        id={id}
        className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border-strong bg-subtle px-3 text-sm text-foreground"
        aria-live="polite"
      >
        {computed ?? (isEmptyValue(value) ? <span className="text-faint-foreground">{t('calculatedAutomatically')}</span> : <bdi className="numeric">{str}</bdi>)}
      </div>
    );
  }

  switch (field.field_type) {
    case 'long_text':
      return <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} maxLength={10000} disabled={disabled} {...aria} />;
    case 'email':
      return <Input id={id} type="email" dir="ltr" value={str} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" disabled={disabled} {...aria} />;
    case 'phone':
      return <Input id={id} type="tel" dir="ltr" inputMode="tel" value={str} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? '05XXXXXXXX'} disabled={disabled} {...aria} />;
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          dir="ltr"
          className="numeric"
          value={str}
          step={field.validation.step ?? 'any'}
          min={field.validation.min}
          max={field.validation.max}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          {...aria}
        />
      );
    case 'currency':
      return (
        <InputGroup
          id={id}
          type="number"
          inputMode="decimal"
          dir="ltr"
          className="numeric"
          min={0}
          step="0.01"
          value={str}
          end={<span className="text-xs font-medium">{tc('sar')}</span>}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          {...aria}
        />
      );
    case 'date':
      if (field.validation.granularity === 'month') return <MonthInput {...props} />;
      return <DatePicker id={id} value={str || null} onChange={(v) => onChange(v)} placeholder={placeholder} disabled={disabled} {...aria} />;
    case 'datetime':
      return <DateTimeInput {...props} />;
    case 'time':
      return <Input id={id} type="time" dir="ltr" className="numeric" value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} {...aria} />;
    case 'yes_no':
      return <YesNoInput {...props} />;
    case 'dropdown':
      if (isChoiceGrid(field)) return <ChoiceGrid {...props} />;
      return (
        <Select value={str || undefined} onValueChange={(v) => onChange(v)} disabled={disabled}>
          <SelectTrigger id={id} className="w-full" {...aria}>
            <SelectValue placeholder={placeholder ?? tc('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {optionLabel(o, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'multi_select':
      return <MultiSelectInput {...props} />;
    case 'leave_type':
      return (
        <Select value={str || undefined} onValueChange={(v) => onChange(v)} disabled={disabled}>
          <SelectTrigger id={id} className="w-full" {...aria}>
            <SelectValue placeholder={placeholder ?? tc('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {lookups.leaveTypes.length === 0 ? (
              <div className="px-3 py-2 text-meta text-muted-foreground">{t('noLeaveTypes')}</div>
            ) : (
              lookups.leaveTypes.map((lt) => (
                <SelectItem key={lt.id} value={lt.id}>
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: lt.color ?? 'var(--primary)' }} aria-hidden />
                  {localized(lt, 'name', locale)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      );
    case 'dependent':
      return <DependentInput {...props} />;
    case 'employee':
      return <EmployeeInput {...props} />;
    case 'attachment':
      return <AttachmentInput {...props} />;
    default:
      return <Input id={id} value={str} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={500} disabled={disabled} {...aria} />;
  }
}

function ChoiceGrid({ id, field, value, onChange, invalid, context, locale }: InputProps) {
  const selected = typeof value === 'string' ? value : '';
  return (
    <RadioGroup
      id={id}
      aria-label={localized(field, 'label', locale)}
      value={selected}
      onValueChange={(v) => onChange(v)}
      disabled={context?.disabled}
      aria-invalid={invalid || undefined}
      className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', field.options.length > 4 && 'xl:grid-cols-3')}
    >
      {field.options.map((o) => {
        const active = o.value === selected;
        const itemId = `${id}-${o.value}`;
        return (
          <label
            key={o.value}
            htmlFor={itemId}
            className={cn(
              'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-sm transition-[border-color,background-color,box-shadow]',
              'hover:border-primary/40 hover:bg-primary-soft/30 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
              active ? 'border-primary bg-primary-soft/50 text-foreground shadow-xs' : 'border-border text-foreground',
              invalid && !selected && 'border-danger/50',
            )}
          >
            <RadioGroupItem id={itemId} value={o.value} />
            <span className="min-w-0 flex-1 leading-snug">{optionLabel(o, locale)}</span>
            {active ? <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden /> : null}
          </label>
        );
      })}
    </RadioGroup>
  );
}

function YesNoInput({ id, describedBy, field, value, onChange, context, locale }: InputProps) {
  const t = useTranslations('requests.form');
  const help = localized(field, 'help', locale);
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-3.5 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="gap-1">
          {localized(field, 'label', locale)}
          {field.required ? (
            <span aria-hidden className="text-danger">
              *
            </span>
          ) : (
            <span className="text-xs font-normal text-faint-foreground">{t('optional')}</span>
          )}
        </Label>
        {help ? (
          <p id={describedBy} className="mt-0.5 text-xs text-muted-foreground">
            {help}
          </p>
        ) : null}
      </div>
      <Switch id={id} checked={value === true} onCheckedChange={(v) => onChange(v)} disabled={context?.disabled} aria-describedby={describedBy} />
    </div>
  );
}

function MultiSelectInput({ id, field, value, onChange, invalid, context, locale }: InputProps) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div id={id} role="group" aria-label={localized(field, 'label', locale)} data-invalid={invalid || undefined} className="flex flex-wrap gap-2">
      {field.options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={context?.disabled}
            onClick={() => toggle(o.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-meta font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50',
              on ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
            )}
          >
            {on ? <CheckIcon className="size-3.5" aria-hidden /> : null}
            {optionLabel(o, locale)}
          </button>
        );
      })}
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function MonthInput({ id, value, onChange, invalid, context, locale }: InputProps) {
  const t = useTranslations('requests.form');
  const iso = typeof value === 'string' ? value : '';
  const [y, m] = iso ? [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))] : [null, null];
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 4 + i);
  const monthName = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone: 'UTC' }), [locale]);
  const set = (year: number | null, month: number | null) => {
    const yy = year ?? thisYear;
    const mm = month ?? new Date().getMonth() + 1;
    onChange(`${yy}-${String(mm).padStart(2, '0')}-01`);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
      <Select value={m ? String(m) : undefined} onValueChange={(v) => set(y, Number(v))} disabled={context?.disabled}>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
          <SelectValue placeholder={t('month')} />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((mm) => (
            <SelectItem key={mm} value={String(mm)}>
              {monthName.format(new Date(Date.UTC(2026, mm - 1, 1)))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={y ? String(y) : undefined} onValueChange={(v) => set(Number(v), m)} disabled={context?.disabled}>
        <SelectTrigger className="w-full numeric" aria-label={t('year')} aria-invalid={invalid || undefined}>
          <SelectValue placeholder={t('year')} />
        </SelectTrigger>
        <SelectContent>
          {years.map((yy) => (
            <SelectItem key={yy} value={String(yy)} className="numeric">
              {yy}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateTimeInput({ id, value, onChange, invalid, context }: InputProps) {
  const t = useTranslations('requests.form');
  const iso = typeof value === 'string' ? value : '';
  const local = iso ? toLocalParts(iso) : { date: '', time: '' };
  const combine = (date: string | null, time: string) => {
    if (!date) return onChange(null);
    const d = new Date(`${date}T${time || '09:00'}:00`);
    onChange(Number.isNaN(d.getTime()) ? null : d.toISOString());
  };
  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2">
      <DatePicker id={id} value={local.date || null} onChange={(v) => combine(v, local.time)} disabled={context?.disabled} aria-invalid={invalid || undefined} />
      <Input type="time" dir="ltr" className="numeric" aria-label={t('time')} value={local.time} onChange={(e) => combine(local.date || null, e.target.value)} disabled={context?.disabled || !local.date} />
    </div>
  );
}

function toLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function DependentInput({ id, describedBy, value, onChange, invalid, lookups, context, locale, field }: InputProps) {
  const t = useTranslations('requests.form');
  const te = useTranslations('enums.relationship');
  const tc = useTranslations('common');
  const str = typeof value === 'string' ? value : '';
  if (!lookups.dependents.length) {
    return (
      <div id={id} aria-describedby={describedBy} className="flex h-9 items-center rounded-md border border-dashed border-border-strong bg-subtle px-3 text-meta text-muted-foreground">
        {t('noDependents')}
      </div>
    );
  }
  const relLabel = (rel: string | null) => (rel && te.has(rel as never) ? te(rel as never) : rel);
  return (
    <Select value={str || undefined} onValueChange={(v) => onChange(v)} disabled={context?.disabled}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
        <SelectValue placeholder={localized(field, 'placeholder', locale) || tc('selectPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        {lookups.dependents.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {employeeDisplayName(d, locale)}
            {d.relationship ? <span className="text-xs text-muted-foreground">· {relLabel(d.relationship)}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function employeeOption(e: EmployeeOption, locale: Locale): ComboboxOption {
  return {
    value: e.id,
    label: employeeDisplayName(e, locale),
    description: [e.employee_number, e.department ? localized(e.department, 'name', locale) : null].filter(Boolean).join(' · ') || undefined,
    keywords: [e.name_ar ?? '', e.name_en ?? '', e.employee_number ?? ''],
  };
}

function EmployeeInput({ id, value, onChange, invalid, lookups, context, locale, field }: InputProps) {
  const t = useTranslations('requests.form');
  const str = typeof value === 'string' ? value : null;
  const known = str && lookups.employees?.[str] ? [employeeOption(lookups.employees[str]!, locale)] : undefined;
  return (
    <Combobox
      id={id}
      value={str}
      onChange={(v) => onChange(v)}
      selectedOptions={known}
      loadOptions={async (q) => {
        const res = await searchEmployees({ q });
        if (!res.ok) throw new Error(res.error);
        return (res.data ?? []).map((e) => employeeOption(e, locale));
      }}
      timeout={20000}
      placeholder={localized(field, 'placeholder', locale) || t('searchEmployee')}
      searchPlaceholder={t('searchEmployee')}
      disabled={context?.disabled}
      aria-invalid={invalid || undefined}
    />
  );
}

function AttachmentInput({ id, field, value, onChange, invalid, context }: InputProps) {
  const items = attachmentsFor(value);
  const existing = items.filter((i): i is AttachmentItem & { kind: 'existing' } => i.kind === 'existing');
  const pending = items.filter((i): i is AttachmentItem & { kind: 'pending' } => i.kind === 'pending');
  const t = useTranslations('requests.form');
  const [removing, setRemoving] = useState<string | null>(null);
  const tErr = useTranslations();

  if (context?.allowAttachments === false) {
    return <p className="text-meta text-muted-foreground">{t('attachmentsDisabled')}</p>;
  }

  const onFiles = (files: File[]) => {
    const keep = new Map(pending.map((p) => [fileKey(p.file), p]));
    const next: AttachmentItem[] = files.map((file) => keep.get(fileKey(file)) ?? { kind: 'pending', id: crypto.randomUUID(), file, fieldKey: field.key });
    onChange([...existing, ...next]);
  };

  const remove = async (item: AttachmentItem & { kind: 'existing' }) => {
    if (!context?.onRemoveAttachment) {
      onChange(items.filter((i) => i.id !== item.id));
      return;
    }
    setRemoving(item.id);
    try {
      const done = await context.onRemoveAttachment(item);
      if (done) onChange(items.filter((i) => i.id !== item.id));
    } catch {
      toast.error(tErr('errors.generic'));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {existing.length ? (
        <AttachmentList
          items={existing}
          onRemove={(item) => void remove(item)}
          removingId={removing}
          disabled={context?.disabled}
        />
      ) : null}
      <FileDropzone
        id={id}
        multiple
        compact
        maxFiles={Math.max(1, 10 - existing.length)}
        maxSize={UPLOAD_LIMITS.attachment.maxBytes}
        accept={ATTACHMENT_ACCEPT}
        value={pending.map((p) => p.file)}
        onChange={onFiles}
        fileStates={context?.uploadStates}
        disabled={context?.disabled}
        aria-invalid={invalid}
      />
    </div>
  );
}

/* ─── Attachment list (shared by the form, the details page and the review step) ─ */

export function AttachmentList({
  items,
  onRemove,
  removingId,
  disabled,
  dense,
}: {
  items: (AttachmentItem & { kind: 'existing' })[];
  onRemove?: (item: AttachmentItem & { kind: 'existing' }) => void;
  removingId?: string | null;
  disabled?: boolean;
  dense?: boolean;
}) {
  const t = useTranslations('requests.form');
  const tc = useTranslations('common');
  const fmt = useDateFormat();
  const size = (bytes: number | null) => {
    if (bytes === null || bytes === undefined) return null;
    const p = fileSizeParts(bytes);
    return tc(`fileSize.${p.unit}`, { size: p.size });
  };
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((item) => (
        <li key={item.id} className={cn('flex items-center gap-3 px-3', dense ? 'py-2' : 'py-2.5')}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            {item.mime?.startsWith('image/') ? <PaperclipIcon className="size-4" aria-hidden /> : <FileTextIcon className="size-4" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <a
              href={fileRouteUrl('request-attachments', item.path)}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-4"
            >
              <bdi>{item.name}</bdi>
            </a>
            <p className="truncate text-xs text-muted-foreground">
              {[size(item.size), item.uploaderName, item.uploadedAt ? fmt.dateTime(item.uploadedAt) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Button asChild variant="ghost" size="icon-sm" aria-label={t('download')}>
            <a href={fileRouteUrl('request-attachments', item.path, { download: true })}>
              <DownloadIcon />
            </a>
          </Button>
          {onRemove && item.canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-danger"
              aria-label={t('removeAttachment')}
              loading={removingId === item.id}
              disabled={disabled || Boolean(removingId)}
              onClick={() => onRemove(item)}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ─── Read-only view ──────────────────────────────────────────────────────── */

function ReadOnlyFields({
  fields,
  values,
  lookups,
  computed,
  columns,
  className,
  locale,
}: {
  fields: RequestField[];
  values: Record<string, unknown>;
  lookups: FormLookups;
  computed?: Record<string, ReactNode>;
  columns: 1 | 2;
  className?: string;
  locale: Locale;
}) {
  const t = useTranslations('requests.form');
  const tc = useTranslations('common');
  const te = useTranslations('enums.relationship');
  const fmt = useDateFormat();

  const render = (field: RequestField): ReactNode => {
    const v = values[field.key];
    if (computed?.[field.key] !== undefined) return computed[field.key];
    if (isEmptyValue(v)) return null;
    switch (field.field_type) {
      case 'date':
        return field.validation.granularity === 'month' ? fmt.monthYear(String(v)) : <span className="numeric">{fmt.date(String(v))}</span>;
      case 'datetime':
        return <span className="numeric">{fmt.dateTime(String(v))}</span>;
      case 'time':
        return <bdi className="numeric">{String(v)}</bdi>;
      case 'yes_no':
        return v === true ? tc('yes') : tc('no');
      case 'number':
        return <span className="numeric">{formatNumber(Number(v), locale)}</span>;
      case 'currency':
        return <span className="numeric">{formatCurrency(Number(v), locale)}</span>;
      case 'dropdown': {
        const o = field.options.find((x) => x.value === v);
        return o ? optionLabel(o, locale) : String(v);
      }
      case 'multi_select':
        return (
          <span className="flex flex-wrap gap-1.5">
            {(Array.isArray(v) ? v : [v]).map((x) => {
              const o = field.options.find((opt) => opt.value === x);
              return (
                <Badge key={String(x)} variant="secondary" size="sm">
                  {o ? optionLabel(o, locale) : String(x)}
                </Badge>
              );
            })}
          </span>
        );
      case 'leave_type': {
        const lt = lookups.leaveTypes.find((x) => x.id === v);
        return lt ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: lt.color ?? 'var(--primary)' }} aria-hidden />
            {localized(lt, 'name', locale)}
          </span>
        ) : (
          t('unavailable')
        );
      }
      case 'dependent': {
        const d = lookups.dependents.find((x) => x.id === v);
        if (!d) return t('unavailable');
        const rel = d.relationship && te.has(d.relationship as never) ? te(d.relationship as never) : d.relationship;
        return `${employeeDisplayName(d, locale)}${rel ? ` · ${rel}` : ''}`;
      }
      case 'employee': {
        const e = lookups.employees?.[String(v)];
        return e ? `${employeeDisplayName(e, locale)}${e.employee_number ? ` · ${e.employee_number}` : ''}` : t('unavailable');
      }
      case 'email':
      case 'phone':
        return <bdi dir="ltr">{String(v)}</bdi>;
      case 'attachment':
        return <AttachmentList items={attachmentsFor(v).filter((i): i is AttachmentItem & { kind: 'existing' } => i.kind === 'existing')} dense />;
      case 'long_text':
        return <bdi className="whitespace-pre-line">{String(v)}</bdi>;
      default:
        // IBANs read in groups of four and stay left-to-right inside Arabic text.
        if (field.key === 'iban' || field.key.endsWith('_iban')) return <bdi dir="ltr" className="numeric">{formatIban(String(v))}</bdi>;
        // Free text may be in either language: isolate it so punctuation stays with its own script.
        return <bdi>{String(v)}</bdi>;
    }
  };

  if (!fields.length) return <p className="text-meta text-muted-foreground">{t('noData')}</p>;

  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', columns === 2 && 'sm:grid-cols-2', className)} data-slot="request-form-readonly">
      {fields.map((field) => {
        const content = render(field);
        const full = FULL_WIDTH.has(field.field_type) || (field.field_type === 'short_text' && String(values[field.key] ?? '').length > 60);
        return (
          <div key={field.key} className={cn('min-w-0', full && 'col-span-full')}>
            <dt className="text-xs font-medium text-muted-foreground">{localized(field, 'label', locale)}</dt>
            <dd className={cn('mt-1 text-sm break-words text-foreground', (content === null || content === '') && 'text-faint-foreground')}>
              {content === null || content === '' ? t('notProvided') : content}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
