'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  GitBranchIcon,
  PaperclipIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { EmptyState } from '@/components/shared/empty-state';
import { FileDropzone, fileKey, type DropzoneFileState } from '@/components/shared/file-dropzone';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useErrorMessage } from '@/components/ui/form';
import { formatDays } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { UPLOAD_LIMITS } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { deleteAttachment, loadRequestLookups, saveRequestDraft, searchEmployees, submitRequest } from '../actions';
import { ATTACHMENT_ACCEPT, REQUEST_CATEGORIES } from '../constants';
import { attachmentsFor, buildRequestPayload, validateRequestValues } from '../form-logic';
import type { AttachmentItem, EmployeeOption, FormLookups, RequestTypeDefinition } from '../types';
import { uploadPendingAttachments } from '../upload';
import { LeaveInsight, type LeaveInsightState } from './leave-insight';
import { ApprovalPath } from './approval-path';
import { TypeIcon } from './request-bits';
import { AttachmentList, RequestFormRenderer } from './request-form-renderer';

type Existing = AttachmentItem & { kind: 'existing' };
type Pending = AttachmentItem & { kind: 'pending' };

export type NewRequestWizardProps = {
  types: RequestTypeDefinition[];
  initialTypeKey: string | null;
  /** The caller's own employee (null when the account is not linked). */
  self: EmployeeOption | null;
  /** HR with org requests.create may file on behalf of another employee. */
  canFileOnBehalf: boolean;
  initialTarget: EmployeeOption | null;
  initialLookups: FormLookups;
  initialManager: { name_ar: string | null; name_en: string | null } | null;
  draft: {
    id: string;
    typeId: string;
    employee: EmployeeOption | null;
    values: Record<string, unknown>;
    attachments: Existing[];
  } | null;
};

type Step = 1 | 2 | 3;

function hasLeaveFields(type: RequestTypeDefinition | null) {
  return Boolean(type?.fields.some((f) => f.field_type === 'leave_type'));
}

/** Seeds form values of a draft: stored values + existing attachments grouped by field. */
function initialValues(type: RequestTypeDefinition | null, draft: NewRequestWizardProps['draft']) {
  const values: Record<string, unknown> = { ...(draft?.values ?? {}) };
  const general: Existing[] = [];
  if (type && draft) {
    const attachmentKeys = new Set(type.fields.filter((f) => f.field_type === 'attachment').map((f) => f.key));
    for (const a of draft.attachments) {
      if (a.fieldKey && attachmentKeys.has(a.fieldKey)) values[a.fieldKey] = [...attachmentsFor(values[a.fieldKey]), a];
      else general.push(a);
    }
  }
  return { values, general };
}

export function NewRequestWizard(props: NewRequestWizardProps) {
  const { types, self, canFileOnBehalf, draft } = props;
  const t = useTranslations('requests.wizard');
  const tr = useTranslations('requests');
  const tc = useTranslations('common');
  const tAll = useTranslations();
  const resolve = useErrorMessage();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const draftType = draft ? (types.find((x) => x.id === draft.typeId) ?? null) : null;
  const preselected = draftType ?? (props.initialTypeKey ? (types.find((x) => x.key === props.initialTypeKey) ?? null) : null);
  const seeded = initialValues(draftType, draft);

  const initialTarget = draft?.employee ?? props.initialTarget ?? self;
  // Without a target employee (e.g. an unlinked super admin filing on behalf) start on step 1.
  const [step, setStep] = useState<Step>(preselected && initialTarget ? 2 : 1);
  const [typeId, setTypeId] = useState<string | null>(preselected?.id ?? null);
  const [target, setTarget] = useState<EmployeeOption | null>(initialTarget);
  const [mode, setMode] = useState<'self' | 'other'>(
    (draft?.employee && self && draft.employee.id !== self.id) || (props.initialTarget && props.initialTarget.id !== self?.id) || !self ? 'other' : 'self',
  );
  const [values, setValues] = useState<Record<string, unknown>>(seeded.values);
  const [general, setGeneral] = useState<AttachmentItem[]>(seeded.general);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [lookups, setLookups] = useState<FormLookups>(props.initialLookups);
  const [manager, setManager] = useState(props.initialManager);
  const [leave, setLeave] = useState<LeaveInsightState>({ preview: null, blocking: [] });
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<string, DropzoneFileState>>({});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const type = types.find((x) => x.id === typeId) ?? null;
  const isLeave = hasLeaveFields(type);
  const employeeId = target?.id ?? null;
  const onBehalf = Boolean(target && self?.id !== target.id);
  const attachmentField = type?.fields.some((f) => f.field_type === 'attachment') ?? false;
  const showGeneralAttachments = Boolean(type?.allow_attachments && !attachmentField);

  /* ── Employee (on behalf) ── */
  const changeTarget = useCallback(
    async (next: EmployeeOption | null) => {
      setTarget(next);
      setValues((v) => {
        const copy = { ...v };
        for (const f of type?.fields ?? []) if (f.field_type === 'dependent' || f.field_type === 'leave_type') delete copy[f.key];
        return copy;
      });
      if (!next) return;
      const res = await loadRequestLookups({ employeeId: next.id });
      if (res.ok && res.data) {
        setLookups({ leaveTypes: res.data.leaveTypes, dependents: res.data.dependents });
        setManager(res.data.manager);
      }
    },
    [type],
  );

  /* ── Type selection ── */
  const chooseType = (id: string) => {
    if (draftId && id !== typeId) return;
    if (id !== typeId) {
      setValues({});
      setGeneral([]);
      setErrors({});
    }
    setTypeId(id);
    // On-behalf filing: the employee must be picked first (the Continue button explains why).
    if (!target) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onChange = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
  };

  /* ── Validation ── */
  const validate = (): boolean => {
    if (!type) return false;
    const errs = validateRequestValues(type.fields, values, { generalAttachments: general.length });
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(tc('form.fixErrors'));
      requestAnimationFrame(() => document.querySelector('[data-field] [aria-invalid="true"], [data-field] [role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return false;
    }
    if (isLeave && leave.blocking.length) {
      toast.error(tAll(`errors.${leave.blocking[0]!}` as never));
      return false;
    }
    return true;
  };

  /* ── Persist draft + attachments ── */
  const pendingItems = (): Pending[] => [
    ...general.filter((a): a is Pending => a.kind === 'pending'),
    ...(type?.fields ?? []).filter((f) => f.field_type === 'attachment').flatMap((f) => attachmentsFor(values[f.key]).filter((a): a is Pending => a.kind === 'pending')),
  ];

  const persist = async (): Promise<string | null> => {
    if (!type) return null;
    const payload = buildRequestPayload(type.fields, values);
    const res = await saveRequestDraft({
      requestId: draftId,
      typeId: type.id,
      employeeId: onBehalf ? employeeId : null,
      values: payload.values,
      subtype: payload.subtype,
    });
    if (!res.ok || !res.data) {
      if (!res.ok && res.fieldErrors) setErrors((e) => ({ ...e, ...res.fieldErrors }));
      toast.error(resolve(res.ok ? 'errors.generic' : res.error));
      return null;
    }
    const id = res.data.id;
    if (!draftId) {
      setDraftId(id);
      window.history.replaceState(null, '', `/requests/new?draft=${id}`);
    }
    const pending = pendingItems();
    if (pending.length) {
      const outcome = await uploadPendingAttachments(id, pending, (key, state) =>
        setUploadStates((s) => ({ ...s, [key]: state.error ? { ...state, error: resolve(state.error) } : state })),
      );
      const done = outcome.uploaded;
      const swap = (items: AttachmentItem[]) => items.map((a) => (a.kind === 'pending' && done.has(a.id) ? done.get(a.id)! : a));
      setGeneral((g) => swap(g));
      setValues((v) => {
        const copy = { ...v };
        for (const f of type.fields) if (f.field_type === 'attachment') copy[f.key] = swap(attachmentsFor(copy[f.key]));
        return copy;
      });
      if (outcome.failed.length) {
        toast.error(t('uploadFailed', { name: outcome.failed[0]!.item.file.name }), { description: resolve(outcome.failed[0]!.error) });
        return null;
      }
    }
    return id;
  };

  const saveDraft = async () => {
    setBusy('draft');
    try {
      const id = await persist();
      if (id) toast.success(tr('toast.draftSaved'));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!validate()) {
      setStep(2);
      return;
    }
    setBusy('submit');
    try {
      const id = await persist();
      if (!id) return;
      const res = await submitRequest({ requestId: id });
      if (!res.ok) {
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
          setStep(2);
        }
        toast.error(resolve(res.error));
        return;
      }
      toast.success(tr('toast.submittedNumber', { number: res.data?.number ?? '' }));
      router.push(`/requests/${id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const removeExisting = async (item: Existing): Promise<boolean> => {
    const res = await deleteAttachment({ attachmentId: item.id });
    if (!res.ok) {
      toast.error(resolve(res.error));
      return false;
    }
    toast.success(tr('toast.attachmentRemoved'));
    return true;
  };

  /* ── Render ── */
  if (!self && !canFileOnBehalf) {
    return (
      <EmptyState
        variant="page"
        icon={UserRoundIcon}
        tone="warning"
        title={t('notLinkedTitle')}
        description={t('notLinkedDescription')}
      />
    );
  }

  const computedDays =
    isLeave && leave.preview?.days !== null && leave.preview?.days !== undefined && values.start_date && values.end_date
      ? { days: `${formatDays(leave.preview.days, locale)} · ${leave.preview.basis === 'calendar' ? tr('leave.calendarDays') : tr('leave.workingDays')}` }
      : undefined;

  const targetReason = !target ? t('pickEmployeeFirst') : null;
  const continueDisabledReason = step === 1 && !type ? t('pickTypeFirst') : targetReason;

  return (
    <div className="flex flex-col gap-5">
      <Stepper step={step} onStep={(s) => (s < step || (s === 2 && type) ? setStep(s) : undefined)} canGoTo={(s) => s < step || (s === 2 && Boolean(type) && step === 3)} />

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          {canFileOnBehalf ? (
            <OnBehalfCard
              self={self}
              mode={mode}
              target={target}
              locked={Boolean(draftId)}
              onMode={(m) => {
                setMode(m);
                void changeTarget(m === 'self' ? self : null);
              }}
              onTarget={(e) => void changeTarget(e)}
            />
          ) : null}
          <TypePicker
            types={types}
            selectedId={typeId}
            lockedId={draftId ? typeId : null}
            query={query}
            onQuery={setQuery}
            category={category}
            onCategory={setCategory}
            onSelect={chooseType}
          />
        </div>
      ) : null}

      {step === 2 && type ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard
              title={localized(type, 'name', locale)}
              description={localized(type, 'description', locale) || undefined}
              icon={<TypeIcon icon={type.icon} color={type.color} size="sm" className="-m-1.5" />}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} disabled={Boolean(draftId)}>
                  {t('changeType')}
                </Button>
              }
            >
              <p className="mb-4 text-xs text-muted-foreground">{tc('form.requiredHint')}</p>
              <RequestFormRenderer
                fields={type.fields}
                values={values}
                onChange={onChange}
                errors={errors}
                context={{
                  employeeId: employeeId ?? undefined,
                  lookups,
                  computed: computedDays,
                  uploadStates,
                  onRemoveAttachment: removeExisting,
                  disabled: busy !== null,
                  allowAttachments: type.allow_attachments,
                }}
              />
            </SectionCard>
            {showGeneralAttachments ? (
              <GeneralAttachments
                items={general}
                onChange={setGeneral}
                onRemoveExisting={removeExisting}
                uploadStates={uploadStates}
                disabled={busy !== null}
              />
            ) : null}
          </div>
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+1rem)]">
            {isLeave ? (
              <LeaveInsight
                employeeId={employeeId}
                leaveTypeId={typeof values.leave_type === 'string' ? values.leave_type : null}
                start={typeof values.start_date === 'string' ? values.start_date : null}
                end={typeof values.end_date === 'string' ? values.end_date : null}
                requestId={draftId}
                leaveTypes={lookups.leaveTypes}
                onChange={setLeave}
              />
            ) : null}
            <SummaryCard type={type} target={target} onBehalf={onBehalf} manager={manager} />
          </aside>
        </div>
      ) : null}

      {step === 3 && type ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard
              title={t('reviewTitle')}
              description={t('reviewDescription')}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  {tc('edit')}
                </Button>
              }
            >
              <div className="mb-4 flex items-center gap-3 rounded-md border border-border bg-subtle px-3 py-2.5">
                <TypeIcon icon={type.icon} color={type.color} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{localized(type, 'name', locale)}</p>
                  {target ? <p className="truncate text-xs text-muted-foreground">{t('forEmployee', { name: employeeDisplayName(target, locale) })}</p> : null}
                </div>
              </div>
              <RequestFormRenderer fields={type.fields.filter((f) => f.field_type !== 'attachment')} values={values} readOnly context={{ lookups, computed: computedDays }} />
            </SectionCard>
            <ReviewAttachments type={type} values={values} general={general} />
          </div>
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+1rem)]">
            <SummaryCard type={type} target={target} onBehalf={onBehalf} manager={manager} showNext />
          </aside>
        </div>
      ) : null}

      <WizardFooter>
        <span className="me-auto text-meta whitespace-nowrap text-muted-foreground numeric max-sm:sr-only">{t('stepOf', { step, total: 3 })}</span>
        {step > 1 ? (
          <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)} disabled={busy !== null}>
            <ArrowLeftIcon className="rtl:rotate-180" />
            {tc('back')}
          </Button>
        ) : null}
        {step >= 2 ? (
          <DisabledReason reason={targetReason}>
            <Button variant="outline" onClick={() => void saveDraft()} loading={busy === 'draft'} disabled={busy !== null || Boolean(targetReason)}>
              <SaveIcon />
              <span className="max-sm:sr-only">{t('saveDraft')}</span>
            </Button>
          </DisabledReason>
        ) : null}
        {step < 3 ? (
          <DisabledReason reason={continueDisabledReason}>
            <Button
              onClick={() => {
                if (step === 1 && type) setStep(2);
                else if (step === 2 && validate()) {
                  setStep(3);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              disabled={Boolean(continueDisabledReason) || busy !== null}
              className="min-w-28"
            >
              {tc('continue')}
              <ArrowRightIcon className="rtl:rotate-180" />
            </Button>
          </DisabledReason>
        ) : (
          <DisabledReason reason={targetReason}>
            <Button onClick={() => void submit()} loading={busy === 'submit'} disabled={busy !== null || Boolean(targetReason)} className="min-w-32">
              <SendIcon className="rtl:-scale-x-100" />
              {t('submit')}
            </Button>
          </DisabledReason>
        )}
      </WizardFooter>
    </div>
  );
}

function DisabledReason({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <SimpleTooltip content={reason}>
      <span tabIndex={0} className="inline-flex">
        {children}
      </span>
    </SimpleTooltip>
  );
}

/* ─── Stepper ─────────────────────────────────────────────────────────────── */

function Stepper({ step, onStep, canGoTo }: { step: Step; onStep: (s: Step) => void; canGoTo: (s: Step) => boolean }) {
  const t = useTranslations('requests.wizard.steps');
  const items: { n: Step; label: string; hint: string }[] = [
    { n: 1, label: t('type'), hint: t('typeHint') },
    { n: 2, label: t('details'), hint: t('detailsHint') },
    { n: 3, label: t('review'), hint: t('reviewHint') },
  ];
  return (
    <ol className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-card sm:gap-3 sm:px-4" aria-label={t('label')}>
      {items.map((item, i) => {
        const done = item.n < step;
        const active = item.n === step;
        const clickable = canGoTo(item.n);
        return (
          <li key={item.n} className={cn('flex min-w-0 items-center gap-2 sm:gap-3', i < items.length - 1 && 'flex-1')}>
            <button
              type="button"
              onClick={() => clickable && onStep(item.n)}
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              className="flex min-w-0 items-center gap-2.5 rounded-md text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-default"
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold numeric ring-1 transition-colors',
                  done && 'bg-primary text-primary-foreground ring-primary',
                  active && 'bg-primary-soft text-primary ring-primary',
                  !done && !active && 'bg-muted text-muted-foreground ring-border',
                )}
              >
                {done ? <CheckIcon className="size-3.5" aria-hidden /> : item.n}
              </span>
              <span className={cn('min-w-0', !active && 'max-sm:hidden')}>
                <span className={cn('block truncate text-sm font-medium', active || done ? 'text-foreground' : 'text-muted-foreground')}>{item.label}</span>
                <span className="block truncate text-xs text-muted-foreground max-md:hidden">{item.hint}</span>
              </span>
            </button>
            {i < items.length - 1 ? <span aria-hidden className={cn('h-px min-w-4 flex-1', done ? 'bg-primary' : 'bg-border')} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ─── Step 1: type picker ─────────────────────────────────────────────────── */

function TypePicker({
  types,
  selectedId,
  lockedId,
  query,
  onQuery,
  category,
  onCategory,
  onSelect,
}: {
  types: RequestTypeDefinition[];
  selectedId: string | null;
  lockedId: string | null;
  query: string;
  onQuery: (q: string) => void;
  category: string;
  onCategory: (c: string) => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('requests');
  const locale = useLocale() as Locale;
  const q = query.trim().toLowerCase();
  const categoryLabel = (c: string) => (t.has(`categories.${c}` as never) ? t(`categories.${c}` as never) : c);

  const categories = useMemo(() => {
    const present = Array.from(new Set(types.map((x) => x.category)));
    return present.sort((a, b) => {
      const ia = (REQUEST_CATEGORIES as readonly string[]).indexOf(a);
      const ib = (REQUEST_CATEGORIES as readonly string[]).indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [types]);

  const filtered = types.filter((x) => {
    if (category !== 'all' && x.category !== category) return false;
    if (!q) return true;
    return [x.name_ar, x.name_en, x.description_ar, x.description_en, x.key].some((s) => s?.toLowerCase().includes(q));
  });
  const ordered = [...filtered].sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || a.sort_order - b.sort_order);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('wizard.searchTypes')} className="h-9 ps-9" aria-label={t('wizard.searchTypes')} />
        </div>
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => onCategory(c)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-meta font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                category === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {c === 'all' ? t('wizard.allCategories') : categoryLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {ordered.length === 0 ? (
        <EmptyState variant="card" icon={SearchIcon} tone="neutral" title={t('wizard.noTypesTitle')} description={t('wizard.noTypesDescription')} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {ordered.map((x) => (
            <TypeCard
              key={x.id}
              type={x}
              category={categoryLabel(x.category)}
              selected={x.id === selectedId}
              locked={Boolean(lockedId && lockedId !== x.id)}
              onSelect={() => onSelect(x.id)}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeCard({
  type,
  category,
  selected,
  locked,
  onSelect,
  locale,
}: {
  type: RequestTypeDefinition;
  category: string;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  locale: Locale;
}) {
  const t = useTranslations('requests.wizard');
  const ts = useTranslations('enums.stepType');
  const path = type.path.map((s) => (ts.has(s.type as never) ? ts(s.type as never) : s.type));
  const card = (
    <button
      type="button"
      onClick={onSelect}
      disabled={locked}
      aria-pressed={selected}
      className={cn(
        'group/type relative flex h-full w-full flex-col gap-3 rounded-lg border bg-card p-4 text-start shadow-card transition-[border-color,box-shadow,transform] outline-none',
        'hover:border-primary/45 hover:shadow-raised focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.995]',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:shadow-card',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <TypeIcon icon={type.icon} color={type.color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{category}</p>
          <p className="text-card-title leading-6 text-foreground">{localized(type, 'name', locale)}</p>
          <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground">{localized(type, 'description', locale)}</p>
        </div>
        {selected ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckIcon className="size-3" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
        {type.sla_business_days !== null ? (
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3.5" aria-hidden />
            {t('slaDays', { count: type.sla_business_days })}
          </span>
        ) : null}
        <span className="inline-flex min-w-0 items-center gap-1">
          <GitBranchIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{path.join(locale === 'ar' ? ' ← ' : ' → ')}</span>
        </span>
      </div>
    </button>
  );
  return locked ? <SimpleTooltip content={t('typeLocked')}>{<span className="block h-full">{card}</span>}</SimpleTooltip> : card;
}

/* ─── On-behalf selector ──────────────────────────────────────────────────── */

function OnBehalfCard({
  self,
  mode,
  target,
  locked,
  onMode,
  onTarget,
}: {
  self: EmployeeOption | null;
  mode: 'self' | 'other';
  target: EmployeeOption | null;
  locked: boolean;
  onMode: (m: 'self' | 'other') => void;
  onTarget: (e: EmployeeOption | null) => void;
}) {
  const t = useTranslations('requests.wizard');
  const locale = useLocale() as Locale;
  const [known, setKnown] = useState<Map<string, EmployeeOption>>(() => new Map(target ? [[target.id, target]] : []));
  const toOption = (e: EmployeeOption): ComboboxOption => ({
    value: e.id,
    label: employeeDisplayName(e, locale),
    description: [e.employee_number, e.department ? localized(e.department, 'name', locale) : null].filter(Boolean).join(' · ') || undefined,
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card md:flex-row md:items-center md:gap-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-secondary-soft-foreground">
          <UsersRoundIcon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t('requestFor')}</p>
          <p className="text-xs text-muted-foreground">{t('requestForHint')}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center md:justify-end">
        <SegmentedTabs
          value={mode}
          onValueChange={(v) => !locked && onMode(v as 'self' | 'other')}
          items={[
            { value: 'self', label: t('myself'), disabled: !self || locked },
            { value: 'other', label: t('anotherEmployee'), disabled: locked },
          ]}
          aria-label={t('requestFor')}
        />
        {mode === 'other' ? (
          <Combobox
            className="sm:w-80"
            value={target && target.id !== self?.id ? target.id : null}
            selectedOptions={target ? [toOption(target)] : undefined}
            disabled={locked}
            onChange={(v) => onTarget(v ? (known.get(v) ?? null) : null)}
            loadOptions={async (q) => {
              const res = await searchEmployees({ q });
              if (!res.ok) throw new Error(res.error);
              const list = res.data ?? [];
              setKnown((m) => {
                const next = new Map(m);
                for (const e of list) next.set(e.id, e);
                return next;
              });
              return list.map(toOption);
            }}
            timeout={20000}
            placeholder={t('pickEmployee')}
            searchPlaceholder={t('searchEmployee')}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ─── Side summary ────────────────────────────────────────────────────────── */

function SummaryCard({
  type,
  target,
  onBehalf,
  manager,
  showNext,
}: {
  type: RequestTypeDefinition;
  target: EmployeeOption | null;
  onBehalf: boolean;
  manager: { name_ar: string | null; name_en: string | null } | null;
  showNext?: boolean;
}) {
  const t = useTranslations('requests.wizard');
  const locale = useLocale() as Locale;
  return (
    <SectionCard title={t('summaryTitle')} dense>
      <dl className="flex flex-col gap-3 text-sm">
        {target ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t('employee')}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
              <span className="truncate">{employeeDisplayName(target, locale)}</span>
              {onBehalf ? (
                <Badge variant="secondary" size="sm">
                  {t('onBehalf')}
                </Badge>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{t('sla')}</dt>
          <dd className="font-medium text-foreground">{type.sla_business_days !== null ? t('slaDays', { count: type.sla_business_days }) : '—'}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-border pt-3.5">
        <p className="mb-2.5 text-xs font-semibold text-muted-foreground">{t('approvalPath')}</p>
        <ApprovalPath steps={type.path} managerName={manager ? employeeDisplayName(manager, locale) : null} />
      </div>
      {showNext ? (
        <p className="mt-4 rounded-md bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">{t('whatNext')}</p>
      ) : null}
    </SectionCard>
  );
}

/* ─── Attachments ─────────────────────────────────────────────────────────── */

function GeneralAttachments({
  items,
  onChange,
  onRemoveExisting,
  uploadStates,
  disabled,
}: {
  items: AttachmentItem[];
  onChange: (items: AttachmentItem[]) => void;
  onRemoveExisting: (item: Existing) => Promise<boolean>;
  uploadStates: Record<string, DropzoneFileState>;
  disabled?: boolean;
}) {
  const t = useTranslations('requests.attachments');
  const existing = items.filter((i): i is Existing => i.kind === 'existing');
  const pending = items.filter((i): i is Pending => i.kind === 'pending');
  const [removing, setRemoving] = useState<string | null>(null);
  return (
    <SectionCard title={t('title')} description={t('hint')} icon={<PaperclipIcon />}>
      <div className="flex flex-col gap-2.5">
        {existing.length ? (
          <AttachmentList
            items={existing}
            removingId={removing}
            disabled={disabled}
            onRemove={async (item) => {
              setRemoving(item.id);
              const ok = await onRemoveExisting(item);
              setRemoving(null);
              if (ok) onChange(items.filter((i) => i.id !== item.id));
            }}
          />
        ) : null}
        <FileDropzone
          multiple
          compact
          maxFiles={Math.max(1, 10 - existing.length)}
          maxSize={UPLOAD_LIMITS.attachment.maxBytes}
          accept={ATTACHMENT_ACCEPT}
          value={pending.map((p) => p.file)}
          onChange={(files) => {
            const keep = new Map(pending.map((p) => [fileKey(p.file), p]));
            onChange([...existing, ...files.map((file) => keep.get(fileKey(file)) ?? ({ kind: 'pending', id: crypto.randomUUID(), file, fieldKey: null } as Pending))]);
          }}
          fileStates={uploadStates}
          disabled={disabled}
        />
      </div>
    </SectionCard>
  );
}

function ReviewAttachments({ type, values, general }: { type: RequestTypeDefinition; values: Record<string, unknown>; general: AttachmentItem[] }) {
  const t = useTranslations('requests.attachments');
  const locale = useLocale() as Locale;
  const groups = [
    ...type.fields.filter((f) => f.field_type === 'attachment').map((f) => ({ label: localized(f, 'label', locale), items: attachmentsFor(values[f.key]) })),
    { label: t('general'), items: general },
  ].filter((g) => g.items.length);
  if (!groups.length) return null;
  return (
    <SectionCard title={t('title')} icon={<PaperclipIcon />} dense>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.label}</p>
            <ul className="flex flex-wrap gap-1.5">
              {g.items.map((i) => (
                <li key={i.id}>
                  <Badge variant="outline" size="lg" className="max-w-72 gap-1.5 bg-card font-normal">
                    <PaperclipIcon className="size-3.5" aria-hidden />
                    <bdi className="truncate">{i.kind === 'pending' ? i.file.name : i.name}</bdi>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────────── */

function WizardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-1 border-t border-border bg-card/92 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 md:-mx-6 md:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full items-center justify-end gap-2">{children}</div>
    </div>
  );
}
