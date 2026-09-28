'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleCheckBigIcon,
  CircleAlertIcon,
  InfoIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  TimerIcon,
  Trash2Icon,
  Undo2Icon,
  UsersRoundIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { saveRequestWorkflow, searchApproverUsers } from '../actions';
import { STEP_TYPES, type RoleOption, type StepType, type UserOption, type WorkflowKind, type WorkflowStep } from '../types';
import { DEFAULT_STEP_NAMES, stepSlaTotal } from '../workflow-logic';
import { BilingualInput } from './bilingual-input';
import { TypeRail, TypeSwitcher, type RailType } from './type-rail';
import { RequestTypeIcon, STEP_ICONS } from './type-visual';
import { useContainerNarrow } from './use-narrow';
import { useUnsavedChangesWarning } from './use-unsaved';

type DraftStep = WorkflowStep & { uid: string };

export type WorkflowTypeInfo = {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  icon: string;
  color: string | null;
  is_active: boolean;
  sla_business_days: number | null;
  openRequests: number;
  kind: WorkflowKind;
};

type Props = {
  types: RailType[];
  type: WorkflowTypeInfo;
  initialSteps: WorkflowStep[];
  roles: RoleOption[];
  users: UserOption[];
  counts: { standard: number; custom: number };
  canEdit: boolean;
};

const STEP_TONE: Record<StepType, string> = {
  manager: 'bg-info',
  hr: 'bg-primary',
  role: 'bg-secondary',
  user: 'bg-success',
};

let uidSeq = 0;
const nextUid = () => `step-${++uidSeq}`;

function toDraft(steps: WorkflowStep[]): DraftStep[] {
  return steps.map((s) => ({ ...s, uid: s.id ?? nextUid() }));
}

function fingerprint(steps: DraftStep[]): string {
  return JSON.stringify(
    steps.map((s) => [s.id, s.step_type, s.name_ar.trim(), s.name_en.trim(), s.approver_role_key, s.approver_user_id, s.sla_business_days, s.can_return, s.can_reassign]),
  );
}

function stepProblems(s: DraftStep): string[] {
  const out: string[] = [];
  if (!s.name_ar.trim() || !s.name_en.trim()) out.push('requestConfig.workflows.problems.name');
  if (s.step_type === 'role' && !s.approver_role_key) out.push('requestConfig.validation.roleRequired');
  if (s.step_type === 'user' && !s.approver_user_id) out.push('requestConfig.validation.userRequired');
  return out;
}

/** Settings › Approval workflows: vertical node editor per request type. */
export function WorkflowBuilder({ types, type, initialSteps, roles, users, counts, canEdit }: Props) {
  const t = useTranslations('requestConfig.workflows');
  const tr = useTranslations('requestConfig');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const resolve = useErrorMessage();
  const initial = useMemo(() => toDraft(initialSteps), [initialSteps]);
  const [steps, setSteps] = useState<DraftStep[]>(initial);
  const [selectedUid, setSelectedUid] = useState<string | null>(initial[0]?.uid ?? null);
  const [knownUsers, setKnownUsers] = useState<UserOption[]>(users);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, startSaving] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const dirty = fingerprint(steps) !== fingerprint(initial);
  useUnsavedChangesWarning(dirty);
  const selected = steps.find((s) => s.uid === selectedUid) ?? null;
  const readOnly = !canEdit;
  const invalid = steps.some((s) => stepProblems(s).length > 0);
  const totalStepSla = stepSlaTotal(steps);

  // Narrow containers show the step properties in a sheet instead of a side pane (never both).
  const narrow = useContainerNarrow(containerRef);
  const select = (uid: string) => {
    setSelectedUid(uid);
    if (narrow) setSheetOpen(true);
  };

  const navigateTo = (key: string) => {
    if (key === type.key) return;
    if (dirty) setPendingNav(key);
    else router.push(`/settings/workflows?type=${key}`);
  };

  const insertAt = (index: number, stepType: StepType) => {
    const step: DraftStep = {
      uid: nextUid(),
      id: null,
      step_order: 0,
      step_type: stepType,
      ...DEFAULT_STEP_NAMES[stepType],
      approver_role_key: null,
      approver_user_id: null,
      sla_business_days: null,
      can_return: true,
      can_reassign: true,
    };
    setSteps((list) => {
      const next = [...list];
      next.splice(index, 0, step);
      return next;
    });
    select(step.uid);
  };

  const patch = (uid: string, p: Partial<DraftStep>) => setSteps((list) => list.map((s) => (s.uid === uid ? { ...s, ...p } : s)));
  const move = (uid: string, dir: -1 | 1) =>
    setSteps((list) => {
      const i = list.findIndex((s) => s.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const remove = (uid: string) => {
    setSteps((list) => list.filter((s) => s.uid !== uid));
    if (selectedUid === uid) {
      setSelectedUid(null);
      setSheetOpen(false);
    }
  };

  const save = () => {
    if (!steps.length) {
      toast.error(resolve('errors.approvalStepRequired'));
      return;
    }
    if (invalid) {
      setShowProblems(true);
      const first = steps.find((s) => stepProblems(s).length);
      if (first) select(first.uid);
      toast.error(t('toast.fixProblems'));
      return;
    }
    startSaving(async () => {
      const result = await saveRequestWorkflow({
        typeId: type.id,
        steps: steps.map((s) => ({
          id: s.id,
          step_type: s.step_type,
          name_ar: s.name_ar.trim(),
          name_en: s.name_en.trim(),
          approver_role_key: s.step_type === 'role' ? s.approver_role_key : null,
          approver_user_id: s.step_type === 'user' ? s.approver_user_id : null,
          sla_business_days: s.sla_business_days,
          can_return: s.can_return,
          can_reassign: s.can_reassign,
        })),
      });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      setShowProblems(false);
      router.refresh();
    });
  };

  const discard = () => {
    setSteps(initial);
    setSelectedUid(initial[0]?.uid ?? null);
    setShowProblems(false);
  };

  const describeApprover = (s: DraftStep): string => {
    if (s.step_type === 'manager') return t('approver.manager');
    if (s.step_type === 'hr') return t('approver.hr');
    if (s.step_type === 'role') {
      const role = roles.find((r) => r.key === s.approver_role_key);
      return role ? t('approver.role', { role: localized(role, 'name', locale) }) : t('approver.roleMissing');
    }
    const user = knownUsers.find((u) => u.id === s.approver_user_id);
    return user ? t('approver.user', { name: user.name }) : t('approver.userMissing');
  };

  const properties = selected ? (
    <StepProperties
      key={selected.uid}
      step={selected}
      roles={roles}
      users={knownUsers}
      onUserPicked={(u) => setKnownUsers((list) => (list.some((x) => x.id === u.id) ? list : [...list, u]))}
      problems={stepProblems(selected)}
      canRemove={steps.length > 1}
      readOnly={readOnly}
      onChange={(p) => patch(selected.uid, p)}
      onRemove={() => remove(selected.uid)}
    />
  ) : (
    <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WorkflowIcon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">{t('properties.noneTitle')}</p>
      <p className="text-meta text-muted-foreground">{t('properties.noneDescription')}</p>
    </div>
  );

  return (
    <div ref={containerRef} className="@container flex min-w-0 flex-col gap-4">
      <PageHeader
        compact
        title={t('title')}
        description={t('description')}
        actions={
          canEdit ? (
            <>
              <Button variant="outline" onClick={() => setConfirmDiscard(true)} disabled={!dirty || saving}>
                <RotateCcwIcon />
                {tc('discard')}
              </Button>
              <Button onClick={save} loading={saving} disabled={!dirty}>
                <SaveIcon />
                {saving ? tc('saving') : tc('saveChanges')}
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_18rem] @min-[54rem]:grid-cols-[12.5rem_minmax(0,1fr)_18.5rem]">
        <TypeRail types={types} selectedKey={type.key} onSelect={navigateTo} className="sticky top-4 hidden @min-[54rem]:flex" />

        <section aria-label={t('canvasLabel')} className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card">
          <header className="flex flex-col gap-3 border-b border-border p-3.5">
            <TypeSwitcher types={types} selectedKey={type.key} onSelect={navigateTo} className="@min-[54rem]:hidden" />
            <div className="flex items-center gap-3">
              <RequestTypeIcon icon={type.icon} color={type.color} size="lg" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="flex items-center gap-2 text-card-title font-semibold text-foreground">
                  <span className="truncate">{localized(type, 'name', locale)}</span>
                  <Badge variant={type.kind === 'custom' ? 'secondary' : 'outline'} size="sm">
                    {t(`kind.${type.kind === 'none' ? 'standard' : type.kind}`)}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('summary', { steps: steps.length })}
                  {type.sla_business_days !== null ? ` · ${t('typeSla', { count: type.sla_business_days })}` : ''}
                  {totalStepSla !== null ? ` · ${t('stepSlaTotal', { count: totalStepSla })}` : ''}
                </p>
              </div>
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
              <span>{t('counts.standard', { count: counts.standard })}</span>
              <span>{t('counts.custom', { count: counts.custom })}</span>
            </p>
          </header>

          {type.openRequests > 0 ? (
            <div className="mx-3.5 mt-3.5 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-meta text-warning-soft-foreground">
              <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('inFlight', { count: type.openRequests })}
            </div>
          ) : null}

          <div
            className="flex flex-col items-center px-3 py-6 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:18px_18px] sm:px-6"
          >
            <TerminalNode kind="start" />
            <Connector disabled={readOnly || steps.length >= 10} onInsert={(st) => insertAt(0, st)} />
            <ol className="flex w-full flex-col items-center" aria-label={t('flowLabel')}>
              {steps.map((s, i) => (
                <li key={s.uid} className="flex w-full flex-col items-center">
                  <StepNode
                    step={s}
                    index={i}
                    count={steps.length}
                    selected={s.uid === selectedUid}
                    hasProblem={showProblems && stepProblems(s).length > 0}
                    approver={describeApprover(s)}
                    readOnly={readOnly}
                    onSelect={() => select(s.uid)}
                    onMove={(dir) => move(s.uid, dir)}
                    onRemove={() => remove(s.uid)}
                  />
                  <Connector disabled={readOnly || steps.length >= 10} onInsert={(st) => insertAt(i + 1, st)} />
                </li>
              ))}
            </ol>
            {!steps.length ? (
              <div className="mb-3 flex w-full max-w-md items-center gap-2 rounded-lg border border-dashed border-danger/40 bg-danger-soft/50 px-3 py-3 text-meta text-danger-soft-foreground">
                <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
                {tr('workflows.noStepsWarning')}
              </div>
            ) : null}
            <TerminalNode kind="end" />
          </div>
        </section>

        <aside aria-label={t('properties.title')} className="sticky top-4 hidden max-h-[calc(100dvh-6rem)] min-w-0 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-card @min-[40rem]:block">
          {narrow ? null : properties}
        </aside>
      </div>

      <Sheet open={sheetOpen && narrow} onOpenChange={setSheetOpen}>
        <SheetContent side="end" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected ? localized(selected, 'name', locale) : t('properties.title')}</SheetTitle>
            <SheetDescription>{t('properties.sheetDescription')}</SheetDescription>
          </SheetHeader>
          <SheetBody>{properties}</SheetBody>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(pendingNav)}
        onOpenChange={(open) => !open && setPendingNav(null)}
        title={tc('unsavedChanges')}
        description={tc('unsavedChangesDescription')}
        confirmLabel={tc('discardChanges')}
        cancelLabel={tc('keepEditing')}
        variant="danger"
        onConfirm={() => {
          const key = pendingNav;
          setPendingNav(null);
          discard();
          if (key) router.push(`/settings/workflows?type=${key}`);
        }}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('discardTitle')}
        description={t('discardDescription')}
        confirmLabel={tc('discardChanges')}
        cancelLabel={tc('keepEditing')}
        variant="danger"
        onConfirm={() => {
          discard();
          setConfirmDiscard(false);
        }}
      />
    </div>
  );
}

function TerminalNode({ kind }: { kind: 'start' | 'end' }) {
  const t = useTranslations('requestConfig.workflows.nodes');
  const Icon = kind === 'start' ? SendIcon : CircleCheckBigIcon;
  return (
    <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-border bg-card px-3 py-2 shadow-xs">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', kind === 'start' ? 'bg-primary-soft text-primary' : 'bg-success-soft text-success')}>
        <Icon className="size-4 flip-rtl" aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-semibold text-foreground">{t(`${kind}.title`)}</span>
        <span className="line-clamp-2 block text-xs text-muted-foreground">{t(`${kind}.description`)}</span>
      </span>
    </div>
  );
}

function Connector({ onInsert, disabled }: { onInsert: (type: StepType) => void; disabled: boolean }) {
  const t = useTranslations('requestConfig.workflows');
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex h-12 w-full justify-center">
      <span aria-hidden className="absolute inset-x-0 inset-y-0 mx-auto w-px bg-border-strong" />
      {disabled ? null : (
        <Popover open={open} onOpenChange={setOpen}>
          <SimpleTooltip content={t('insertHere')}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t('insertHere')}
                className="relative z-[1] my-auto flex size-6 items-center justify-center rounded-full border border-border-strong bg-card text-muted-foreground shadow-xs transition-colors outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:border-primary data-[state=open]:text-primary"
              >
                <PlusIcon className="size-3.5" />
              </button>
            </PopoverTrigger>
          </SimpleTooltip>
          <PopoverContent className="w-64 p-1.5" align="center">
            <p className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">{t('addStep')}</p>
            {STEP_TYPES.map((st) => {
              const Icon = STEP_ICONS[st];
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onInsert(st);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-start outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-white', STEP_TONE[st])}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[0.8125rem] font-medium text-foreground">{t(`types.${st}.label`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`types.${st}.hint`)}</span>
                  </span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function StepNode({
  step,
  index,
  count,
  selected,
  hasProblem,
  approver,
  readOnly,
  onSelect,
  onMove,
  onRemove,
}: {
  step: DraftStep;
  index: number;
  count: number;
  selected: boolean;
  hasProblem: boolean;
  approver: string;
  readOnly: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('requestConfig.workflows');
  const locale = useLocale() as Locale;
  const Icon = STEP_ICONS[step.step_type];
  return (
    <div
      className={cn(
        'group/step relative flex w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-card transition-[border-color,box-shadow]',
        selected ? 'border-primary/60 ring-2 ring-primary/20' : 'border-border hover:border-border-strong',
        hasProblem && 'border-danger/60 ring-2 ring-danger/15',
      )}
    >
      <span aria-hidden className={cn('w-1 shrink-0', STEP_TONE[step.step_type])} />
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-start outline-none focus-visible:bg-accent/60">
        <span className="relative mt-0.5 shrink-0">
          <span className={cn('flex size-9 items-center justify-center rounded-lg text-white', STEP_TONE[step.step_type])}>
            <Icon className="size-4.5" aria-hidden />
          </span>
          <span className="numeric absolute -end-1.5 -top-1.5 flex size-4.5 items-center justify-center rounded-full border border-card bg-foreground text-[0.625rem] font-semibold text-background">
            {index + 1}
          </span>
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">{localized(step, 'name', locale) || t(`types.${step.step_type}.label`)}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{approver}</span>
          <span className="mt-2 flex flex-wrap gap-1">
            <Badge variant="outline" size="sm">
              {t(`types.${step.step_type}.label`)}
            </Badge>
            {step.sla_business_days !== null ? (
              <Badge variant="neutral" size="sm">
                <TimerIcon className="size-3" aria-hidden />
                {t('stepSla', { count: step.sla_business_days })}
              </Badge>
            ) : null}
            {step.can_return ? (
              <Badge variant="neutral" size="sm">
                <Undo2Icon className="size-3" aria-hidden />
                {t('canReturnShort')}
              </Badge>
            ) : null}
            {step.can_reassign ? (
              <Badge variant="neutral" size="sm">
                <UsersRoundIcon className="size-3" aria-hidden />
                {t('canReassignShort')}
              </Badge>
            ) : null}
          </span>
        </span>
      </button>
      {readOnly ? null : (
        <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-s border-border px-1 py-1">
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('moveUp')}>
            <ArrowUpIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('moveDown')}>
            <ArrowDownIcon />
          </Button>
          <SimpleTooltip content={count <= 1 ? t('lastStep') : undefined}>
            <span tabIndex={count <= 1 ? 0 : -1}>
              <Button type="button" variant="ghost" size="icon-xs" disabled={count <= 1} onClick={onRemove} aria-label={t('removeStep')} className="text-muted-foreground hover:text-danger">
                <Trash2Icon />
              </Button>
            </span>
          </SimpleTooltip>
        </div>
      )}
    </div>
  );
}

function StepProperties({
  step,
  roles,
  users,
  onUserPicked,
  problems,
  canRemove,
  readOnly,
  onChange,
  onRemove,
}: {
  step: DraftStep;
  roles: RoleOption[];
  users: UserOption[];
  onUserPicked: (u: UserOption) => void;
  problems: string[];
  canRemove: boolean;
  readOnly: boolean;
  onChange: (p: Partial<DraftStep>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('requestConfig.workflows');
  const tRoot = useTranslations();
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const resolve = useErrorMessage();

  const setType = (next: StepType) => {
    if (next === step.step_type) return;
    const prev = DEFAULT_STEP_NAMES[step.step_type];
    const keepNames = step.name_ar.trim() !== prev.name_ar || step.name_en.trim() !== prev.name_en;
    onChange({ step_type: next, ...(keepNames ? {} : DEFAULT_STEP_NAMES[next]) });
  };

  const loadUsers = useCallback(
    async (query: string): Promise<ComboboxOption[]> => {
      const result = await searchApproverUsers({ query });
      if (!result.ok) throw new Error(resolve(result.error));
      return (result.data ?? []).map((u) => ({ value: u.id, label: u.name, description: u.email ?? undefined }));
    },
    [resolve],
  );
  const selectedUser = users.find((u) => u.id === step.approver_user_id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-card-title font-semibold text-foreground">{t('properties.title')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('properties.description')}</p>
      </div>

      {problems.length ? (
        <ul className="flex flex-col gap-1 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-meta text-danger-soft-foreground">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-1.5">
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {tRoot(p as 'requestConfig.workflows.problems.name')}
            </li>
          ))}
        </ul>
      ) : null}

      <fieldset className="flex flex-col gap-2" disabled={readOnly}>
        <legend className="mb-2 text-sm font-semibold text-foreground">{t('properties.type')}</legend>
        <div role="radiogroup" aria-label={t('properties.type')} className="grid grid-cols-2 gap-1.5">
          {STEP_TYPES.map((st) => {
            const Icon = STEP_ICONS[st];
            const active = st === step.step_type;
            return (
              <button
                key={st}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readOnly}
                onClick={() => setType(st)}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60',
                  active ? 'border-primary bg-primary-soft/60' : 'border-border hover:bg-accent',
                )}
              >
                <span className={cn('flex size-6 items-center justify-center rounded text-white', STEP_TONE[st])}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="text-[0.8125rem] leading-tight font-medium text-foreground">{t(`types.${st}.label`)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t(`types.${step.step_type}.hint`)}</p>
      </fieldset>

      {step.step_type === 'role' ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-semibold">{t('properties.role')}</Label>
          <Select value={step.approver_role_key ?? ''} disabled={readOnly} onValueChange={(v) => onChange({ approver_role_key: v })}>
            <SelectTrigger className="w-full" aria-invalid={!step.approver_role_key || undefined}>
              <SelectValue placeholder={t('properties.rolePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {localized(r, 'name', locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('properties.roleHint')}</p>
        </div>
      ) : null}

      {step.step_type === 'user' ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-semibold">{t('properties.user')}</Label>
          <Combobox
            value={step.approver_user_id}
            onChange={(value, option) => {
              onChange({ approver_user_id: value });
              if (value && option) onUserPicked({ id: value, name: option.label, email: option.description ?? null });
            }}
            loadOptions={loadUsers}
            selectedOptions={selectedUser ? [{ value: selectedUser.id, label: selectedUser.name, description: selectedUser.email ?? undefined }] : []}
            placeholder={t('properties.userPlaceholder')}
            searchPlaceholder={t('properties.userSearch')}
            disabled={readOnly}
            clearable={false}
          />
          <p className="text-xs text-muted-foreground">{t('properties.userHint')}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">{t('properties.name')}</p>
        <BilingualInput label={t('properties.name')} valueAr={step.name_ar} valueEn={step.name_en} onChange={(ar, en) => onChange({ name_ar: ar, name_en: en })} disabled={readOnly} required maxLength={120} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`sla-${step.uid}`} className="text-sm font-semibold">
          {t('properties.sla')}
          <span className="ms-1.5 text-xs font-normal text-muted-foreground">{tc('optionalSuffix')}</span>
        </Label>
        <Input
          id={`sla-${step.uid}`}
          type="number"
          min={0}
          max={365}
          dir="ltr"
          inputMode="numeric"
          className="numeric h-8 max-w-28"
          disabled={readOnly}
          value={step.sla_business_days ?? ''}
          onChange={(e) => onChange({ sla_business_days: e.target.value === '' ? null : Math.max(0, Math.min(365, Math.round(Number(e.target.value)))) })}
        />
        <p className="text-xs text-muted-foreground">{t('properties.slaHint')}</p>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        <SwitchLine label={t('properties.canReturn')} hint={t('properties.canReturnHint')} checked={step.can_return} disabled={readOnly} onChange={(v) => onChange({ can_return: v })} />
        <SwitchLine label={t('properties.canReassign')} hint={t('properties.canReassignHint')} checked={step.can_reassign} disabled={readOnly} onChange={(v) => onChange({ can_reassign: v })} />
      </div>

      {readOnly ? null : (
        <SimpleTooltip content={canRemove ? undefined : t('lastStep')}>
          <span tabIndex={canRemove ? -1 : 0} className="self-start">
            <Button type="button" variant="outline" size="sm" disabled={!canRemove} onClick={onRemove} className="text-danger hover:text-danger">
              <Trash2Icon />
              {t('removeStep')}
            </Button>
          </span>
        </SimpleTooltip>
      )}
    </div>
  );
}

function SwitchLine({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
      <span className="min-w-0 leading-tight">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}
