'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FormInputIcon,
  GripVerticalIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilRulerIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  RotateCcwIcon,
  SaveIcon,
  SplitIcon,
  Trash2Icon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations, type AbstractIntlMessages } from 'next-intl';
import { useId, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useErrorMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { saveRequestFields } from '../actions';
import { createField, duplicateField, fingerprint, parseRule, serializeRule, toPayload, validateFields } from '../builder-logic';
import type { BuilderField, LeaveTypeLite, RequestFieldType, VisibilityRule } from '../types';
import { FieldProperties } from './field-properties';
import { FIELD_TYPE_ICONS, PALETTE_GROUPS } from './field-type-icons';
import { FormPreview } from './form-preview';
import { fieldTypeLabel } from './labels';
import { TypeRail, TypeSwitcher, type RailType } from './type-rail';
import { RequestTypeIcon } from './type-visual';
import { useContainerNarrow } from './use-narrow';
import { useUnsavedChangesWarning } from './use-unsaved';

export type BuilderTypeInfo = {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  icon: string;
  color: string | null;
  is_active: boolean;
  allow_attachments: boolean;
};

type Props = {
  types: RailType[];
  type: BuilderTypeInfo;
  initialFields: BuilderField[];
  leaveTypes: LeaveTypeLite[];
  canEdit: boolean;
  otherMessages: AbstractIntlMessages;
  /** Field type names in both languages (default labels of new fields). */
  typeNames: { ar: Record<string, string>; en: Record<string, string> };
  wordings: { copyAr: string; copyEn: string; optionAr: string; optionEn: string };
};

function renameRefs(rule: VisibilityRule | null, from: string, to: string): VisibilityRule | null {
  if (!rule) return rule;
  return JSON.parse(JSON.stringify(rule), (k, v) => (k === 'field' && v === from ? to : v)) as VisibilityRule;
}

function dropRefs(rule: VisibilityRule | null, key: string): VisibilityRule | null {
  const model = parseRule(rule);
  if ('unsupported' in model) return rule;
  return serializeRule({ ...model, conditions: model.conditions.filter((c) => c.field !== key) });
}

/** Settings › Form builder: types rail · sortable fields · properties panel · live preview. */
export function FormBuilder({ types, type, initialFields, leaveTypes, canEdit, otherMessages, typeNames, wordings }: Props) {
  const t = useTranslations('requestConfig.builder');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const resolve = useErrorMessage();
  const [fields, setFields] = useState<BuilderField[]>(() => structuredClone(initialFields));
  const [selectedUid, setSelectedUid] = useState<string | null>(initialFields[0]?.uid ?? null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [showProblems, setShowProblems] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [toDelete, setToDelete] = useState<BuilderField | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const dndId = useId();

  const baseline = useMemo(() => fingerprint(initialFields), [initialFields]);
  const dirty = useMemo(() => fingerprint(fields) !== baseline, [fields, baseline]);
  const problems = useMemo(() => validateFields(fields), [fields]);
  const savedOptions = useMemo(() => new Map(initialFields.map((f) => [f.uid, new Set(f.id ? f.options.map((o) => o.value) : [])])), [initialFields]);
  const selected = fields.find((f) => f.uid === selectedUid) ?? null;
  const readOnly = !canEdit;
  useUnsavedChangesWarning(dirty);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Narrow containers show the properties panel in a sheet instead of a side pane (never both).
  const narrow = useContainerNarrow(containerRef);
  const select = (uid: string) => {
    setSelectedUid(uid);
    if (narrow) setSheetOpen(true);
  };

  const navigateTo = (key: string) => {
    if (key === type.key) return;
    if (dirty) setPendingNav(key);
    else router.push(`/settings/form-builder?type=${key}`);
  };

  const patchField = (uid: string, patch: Partial<BuilderField>) =>
    setFields((list) => {
      const current = list.find((f) => f.uid === uid);
      const renamed = current && patch.key !== undefined && patch.key !== current.key ? { from: current.key, to: patch.key } : null;
      return list.map((f) => {
        if (f.uid === uid) return { ...f, ...patch };
        return renamed ? { ...f, visibility: renameRefs(f.visibility, renamed.from, renamed.to) } : f;
      });
    });

  const addField = (fieldType: RequestFieldType) => {
    const taken = new Set(fields.map((f) => f.key));
    const field = createField(
      fieldType,
      taken,
      { ar: typeNames.ar[fieldType] ?? fieldType, en: typeNames.en[fieldType] ?? fieldType },
      { ar: wordings.optionAr, en: wordings.optionEn },
    );
    setFields((list) => {
      const at = selectedUid ? list.findIndex((f) => f.uid === selectedUid) : -1;
      const next = [...list];
      next.splice(at >= 0 ? at + 1 : next.length, 0, field);
      return next;
    });
    setPaletteOpen(false);
    select(field.uid);
  };

  const duplicate = (field: BuilderField) => {
    const copy = duplicateField(field, new Set(fields.map((f) => f.key)), { ar: wordings.copyAr, en: wordings.copyEn });
    setFields((list) => {
      const at = list.findIndex((f) => f.uid === field.uid);
      const next = [...list];
      next.splice(at + 1, 0, copy);
      return next;
    });
    select(copy.uid);
  };

  const remove = (field: BuilderField) => {
    const index = fields.findIndex((f) => f.uid === field.uid);
    const rest = fields.filter((f) => f.uid !== field.uid);
    setFields(rest.map((f) => ({ ...f, visibility: dropRefs(f.visibility, field.key) })));
    if (selectedUid === field.uid) {
      setSelectedUid(rest[Math.min(index, rest.length - 1)]?.uid ?? null);
      setSheetOpen(false);
    }
    setToDelete(null);
  };

  const move = (uid: string, dir: -1 | 1) =>
    setFields((list) => {
      const i = list.findIndex((f) => f.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      return arrayMove(list, i, j);
    });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setFields((list) => arrayMove(list, list.findIndex((f) => f.uid === e.active.id), list.findIndex((f) => f.uid === e.over!.id)));
  };

  const save = () => {
    if (problems.size) {
      setShowProblems(true);
      const first = fields.find((f) => problems.has(f.uid));
      if (first) select(first.uid);
      toast.error(t('toast.fixProblems', { count: problems.size }));
      return;
    }
    startSaving(async () => {
      const result = await saveRequestFields({ typeId: type.id, fields: toPayload(fields) });
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
    setFields(structuredClone(initialFields));
    setSelectedUid(initialFields[0]?.uid ?? null);
    setShowProblems(false);
  };

  const nameOf = (id: string | number | undefined) => {
    const f = fields.find((x) => x.uid === id);
    return f ? localized(f, 'label', locale) || f.key : '';
  };
  const positionOf = (id: string | number | undefined) => fields.findIndex((x) => x.uid === id) + 1;
  const accessibility = {
    screenReaderInstructions: { draggable: t('dnd.instructions') },
    announcements: {
      onDragStart: ({ active }: { active: { id: string | number } }) => t('dnd.picked', { name: nameOf(active.id), position: positionOf(active.id) }),
      onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
        over ? t('dnd.over', { name: nameOf(active.id), position: positionOf(over.id) }) : undefined,
      onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
        over ? t('dnd.dropped', { name: nameOf(active.id), position: positionOf(over.id) }) : undefined,
      onDragCancel: ({ active }: { active: { id: string | number } }) => t('dnd.cancelled', { name: nameOf(active.id) }),
    },
  };

  const required = fields.filter((f) => f.required && f.is_active !== false).length;
  const conditional = fields.filter((f) => f.visibility).length;
  const typeName = localized(type, 'name', locale);

  const fieldActions = (f: BuilderField, index: number) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={tc('moreActions')} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem disabled={readOnly || index === 0} onSelect={() => move(f.uid, -1)}>
          <ArrowUpIcon />
          {t('actions.moveUp')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={readOnly || index === fields.length - 1} onSelect={() => move(f.uid, 1)}>
          <ArrowDownIcon />
          {t('actions.moveDown')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={readOnly} onSelect={() => duplicate(f)}>
          <CopyIcon />
          {tc('duplicate')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={readOnly || Boolean(f.is_system)}
          title={f.is_system ? t('properties.activeSystem') : undefined}
          onSelect={() => patchField(f.uid, { is_active: f.is_active === false })}
        >
          {f.is_active === false ? <PowerIcon /> : <PowerOffIcon />}
          {f.is_active === false ? tc('activate') : tc('deactivate')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={readOnly || Boolean(f.is_system) || f.uses > 0}
          title={f.is_system ? t('deleteSystem') : f.uses > 0 ? t('deleteUsed', { count: f.uses }) : undefined}
          onSelect={() => setToDelete(f)}
        >
          <Trash2Icon />
          {tc('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const palette = (
    <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" disabled={readOnly || fields.length >= 80}>
          <PlusIcon />
          {t('addField')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-2">
        {PALETTE_GROUPS.map((g) => (
          <div key={g.key} className="mb-1.5 last:mb-0">
            <p className="px-1.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">{t(`palette.${g.key}`)}</p>
            <div className="grid grid-cols-2 gap-1">
              {g.types.map((ft) => {
                const Icon = FIELD_TYPE_ICONS[ft];
                return (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => addField(ft)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-start text-[0.8125rem] text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="truncate">{fieldTypeLabel(tRoot, ft)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );

  const properties = selected ? (
    <FieldProperties
      key={selected.uid}
      field={selected}
      fields={fields}
      leaveTypes={leaveTypes}
      savedOptionValues={savedOptions.get(selected.uid) ?? new Set()}
      problems={problems.get(selected.uid) ?? []}
      readOnly={readOnly}
      onChange={(patch) => patchField(selected.uid, patch)}
    />
  ) : (
    <EmptyState variant="inline" icon={PencilRulerIcon} title={t('properties.noneTitle')} description={t('properties.noneDescription')} />
  );

  return (
    <div ref={containerRef} className="@container flex min-w-0 flex-col gap-4">
      <PageHeader
        compact
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <SegmentedTabs
              size="sm"
              aria-label={t('modeLabel')}
              value={mode}
              onValueChange={(v) => setMode(v as 'edit' | 'preview')}
              items={[
                { value: 'edit', label: t('modes.edit'), icon: <PencilRulerIcon className="size-3.5" /> },
                { value: 'preview', label: t('modes.preview'), icon: <EyeIcon className="size-3.5" /> },
              ]}
            />
            {canEdit ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setConfirmDiscard(true)} disabled={!dirty || saving}>
                  <RotateCcwIcon />
                  {tc('discard')}
                </Button>
                <Button onClick={save} loading={saving} disabled={!dirty}>
                  <SaveIcon />
                  {saving ? tc('saving') : tc('saveChanges')}
                </Button>
              </div>
            ) : null}
          </>
        }
      />

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_18rem] @min-[54rem]:grid-cols-[12.5rem_minmax(0,1fr)_18.5rem]">
        <TypeRail types={types} selectedKey={type.key} onSelect={navigateTo} className="sticky top-4 hidden @min-[54rem]:flex" />

        {mode === 'preview' ? (
          <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-card @min-[40rem]:col-span-2 sm:p-5">
            <FormPreview fields={fields} typeName={type} allowAttachments={type.allow_attachments} otherMessages={otherMessages} />
          </section>
        ) : (
          <>
            <section aria-label={t('fieldsLabel')} className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card">
              <header className="flex flex-col gap-3 border-b border-border p-3.5">
                <TypeSwitcher types={types} selectedKey={type.key} onSelect={navigateTo} className="@min-[54rem]:hidden" />
                <div className="flex items-center gap-3">
                  <RequestTypeIcon icon={type.icon} color={type.color} size="lg" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="flex items-center gap-2 truncate text-card-title font-semibold text-foreground">
                      <span className="truncate">{typeName}</span>
                      {!type.is_active ? (
                        <Badge variant="neutral" size="sm">
                          {tc('inactive')}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('summary', { fields: fields.length, required, conditional })}</p>
                  </div>
                  {palette}
                </div>
              </header>

              {fields.length ? (
                <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={accessibility}>
                  <SortableContext items={fields.map((f) => f.uid)} strategy={verticalListSortingStrategy}>
                    <ol className="flex flex-col gap-1.5 p-2.5">
                      {fields.map((f, i) => (
                        <FieldCard
                          key={f.uid}
                          field={f}
                          index={i}
                          selected={f.uid === selectedUid}
                          hasProblem={showProblems && problems.has(f.uid)}
                          readOnly={readOnly}
                          onSelect={() => select(f.uid)}
                          actions={fieldActions(f, i)}
                        />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              ) : (
                <EmptyState
                  variant="inline"
                  icon={FormInputIcon}
                  title={t('emptyTitle')}
                  description={t('emptyDescription')}
                  className="py-10"
                />
              )}
              {canEdit ? <p className="border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">{t('reorderHint')}</p> : null}
            </section>

            <aside aria-label={t('properties.title')} className="sticky top-4 hidden max-h-[calc(100dvh-6rem)] min-w-0 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-card @min-[40rem]:block">
              {narrow ? null : properties}
            </aside>
          </>
        )}
      </div>

      <Sheet open={sheetOpen && narrow && mode === 'edit'} onOpenChange={setSheetOpen}>
        <SheetContent side="end" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected ? localized(selected, 'label', locale) || selected.key : t('properties.title')}</SheetTitle>
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
          if (key) router.push(`/settings/form-builder?type=${key}`);
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
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('deleteTitle')}
        description={toDelete ? t('deleteDescription', { name: localized(toDelete, 'label', locale) || toDelete.key }) : undefined}
        confirmLabel={tc('delete')}
        variant="danger"
        onConfirm={() => {
          if (toDelete) remove(toDelete);
        }}
      />
    </div>
  );
}

function FieldCard({
  field,
  index,
  selected,
  hasProblem,
  readOnly,
  onSelect,
  actions,
}: {
  field: BuilderField;
  index: number;
  selected: boolean;
  hasProblem: boolean;
  readOnly: boolean;
  onSelect: () => void;
  actions: ReactNode;
}) {
  const t = useTranslations('requestConfig.builder');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.uid, disabled: readOnly });
  const Icon = FIELD_TYPE_ICONS[field.field_type];
  const label = localized(field, 'label', locale);
  const inactive = field.is_active === false;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/field relative flex items-start gap-1.5 rounded-lg border bg-card py-2 ps-1 pe-1.5 transition-[border-color,box-shadow,background-color]',
        selected ? 'border-primary/60 bg-primary-soft/40 ring-1 ring-primary/25' : 'border-border hover:border-border-strong',
        hasProblem && 'border-danger/60 ring-1 ring-danger/20',
        isDragging && 'z-10 shadow-raised',
      )}
    >
      <button
        type="button"
        className={cn(
          'mt-0.5 flex h-7 w-5 shrink-0 touch-none items-center justify-center rounded-sm text-faint-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
          readOnly ? 'cursor-default opacity-40' : 'cursor-grab hover:text-foreground active:cursor-grabbing',
        )}
        aria-label={t('dragHandle', { name: label || field.key, position: index + 1 })}
        disabled={readOnly}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <button type="button" onClick={onSelect} aria-pressed={selected} className={cn('flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60', inactive && 'opacity-60')}>
        <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-medium text-foreground">{label || <span className="text-muted-foreground italic">{t('untitled')}</span>}</span>
            {field.required ? (
              <span className="text-danger" aria-label={tc('required')}>
                *
              </span>
            ) : null}
            {field.is_system ? <LockIcon className="size-3 shrink-0 text-faint-foreground" aria-label={t('system')} /> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span dir="ltr" className="truncate font-mono text-2xs">
              {field.key}
            </span>
            <span aria-hidden>·</span>
            <span>{fieldTypeLabel(tRoot, field.field_type)}</span>
          </span>
          {field.visibility || inactive || hasProblem ? (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {field.visibility ? (
                <Badge variant="info" size="sm">
                  <SplitIcon className="size-3" aria-hidden />
                  {t('conditional')}
                </Badge>
              ) : null}
              {inactive ? (
                <Badge variant="neutral" size="sm">
                  <EyeOffIcon className="size-3" aria-hidden />
                  {tc('inactive')}
                </Badge>
              ) : null}
              {hasProblem ? (
                <Badge variant="danger" size="sm">
                  <CircleAlertIcon className="size-3" aria-hidden />
                  {t('needsAttention')}
                </Badge>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>
      {field.uses ? (
        <SimpleTooltip content={t('usedIn', { count: field.uses })}>
          <span tabIndex={0} className="mt-1.5 hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground @min-[30rem]:inline">
            {field.uses}
          </span>
        </SimpleTooltip>
      ) : null}
      <span className="mt-0.5 shrink-0">{actions}</span>
    </li>
  );
}
