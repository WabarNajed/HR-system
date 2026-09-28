'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, ListPlusIcon, LockIcon, XIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { SearchInput } from '@/components/shared/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BUILDER_LIMITS, type BuilderField } from '../../builder/sources';
import { useReportT } from '../format';

const SECTIONS: BuilderField['section'][] = ['record', 'employee', 'dates', 'personal', 'compensation'];

type Props = {
  fields: BuilderField[];
  /** Fields hidden by permissions (count only, for the hint). */
  restrictedCount: number;
  value: string[];
  onChange: (next: string[]) => void;
};

function SortableColumn({
  field,
  index,
  count,
  onMove,
  onRemove,
}: {
  field: BuilderField;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  const t = useReportT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/col flex h-9 items-center gap-1.5 rounded-md border border-border bg-card ps-1 pe-1 text-sm shadow-xs',
        isDragging && 'relative z-10 border-primary/40 shadow-raised',
      )}
    >
      <button
        type="button"
        className="flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded-sm text-faint-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
        aria-label={t('reports.builder.dragHint')}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="w-5 shrink-0 text-center text-xs text-muted-foreground numeric">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{t(`reports.builder.fields.${field.labelId}`)}</span>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 transition-opacity group-hover/col:opacity-100 focus-visible:opacity-100 disabled:invisible max-md:opacity-100"
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
          aria-label={t('reports.builder.moveUp')}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 transition-opacity group-hover/col:opacity-100 focus-visible:opacity-100 disabled:invisible max-md:opacity-100"
          disabled={index === count - 1}
          onClick={() => onMove(index, index + 1)}
          aria-label={t('reports.builder.moveDown')}
        >
          <ArrowDownIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={t('reports.builder.removeColumn')}
          className="hover:text-danger"
        >
          <XIcon />
        </Button>
      </div>
    </li>
  );
}

/** Column picker: searchable, grouped checklist + sortable selected list (drag or arrow buttons). */
export function BuilderColumns({ fields, restrictedCount, value, onChange }: Props) {
  const t = useReportT();
  const [query, setQuery] = useState('');
  // Stable accessibility ids for SSR (dnd-kit otherwise generates different ids on the client).
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const selected = value.map((k) => byKey.get(k)).filter((f): f is BuilderField => Boolean(f));
  const selectedSet = new Set(value);

  const q = query.trim().toLocaleLowerCase();
  const matches = fields.filter((f) => !q || t(`reports.builder.fields.${f.labelId}`).toLocaleLowerCase().includes(q));

  const toggle = (key: string, on: boolean) => {
    if (on) {
      if (value.length >= BUILDER_LIMITS.columns) return;
      onChange([...value, key]);
    } else onChange(value.filter((k) => k !== key));
  };
  const move = (from: number, to: number) => onChange(arrayMove(value, from, to));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(value.indexOf(String(e.active.id)), value.indexOf(String(e.over.id)));
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      {/* Available */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-meta font-semibold text-muted-foreground">{t('reports.builder.available')}</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onChange(Array.from(new Set([...value, ...matches.map((f) => f.key)])).slice(0, BUILDER_LIMITS.columns))}
            >
              <ListPlusIcon />
              {t('reports.builder.selectAll')}
            </Button>
          </div>
        </div>
        <SearchInput value={query} onSearch={setQuery} debounce={80} placeholder={t('reports.builder.searchColumns')} className="h-8" />
        <div className="max-h-72 min-h-40 overflow-y-auto rounded-md border border-border bg-subtle/40 p-1.5">
          {matches.length ? (
            SECTIONS.filter((s) => matches.some((f) => f.section === s)).map((section) => (
              <div key={section} className="mb-1 last:mb-0">
                <div className="px-2 pt-1.5 pb-1 text-2xs font-semibold tracking-wide text-faint-foreground uppercase">
                  {t(`reports.builder.sections.${section}`)}
                </div>
                {matches
                  .filter((f) => f.section === section)
                  .map((f) => {
                    const id = `col-${f.key}`;
                    const checked = selectedSet.has(f.key);
                    return (
                      <label
                        key={f.key}
                        htmlFor={id}
                        className={cn(
                          'flex h-8 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm transition-colors hover:bg-accent',
                          checked && 'text-foreground',
                        )}
                      >
                        <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggle(f.key, Boolean(v))} />
                        <span className="min-w-0 flex-1 truncate">{t(`reports.builder.fields.${f.labelId}`)}</span>
                        {f.permission ? <LockIcon className="size-3 shrink-0 text-faint-foreground" aria-hidden /> : null}
                      </label>
                    );
                  })}
              </div>
            ))
          ) : (
            <p className="px-2 py-6 text-center text-meta text-muted-foreground">{t('reports.builder.noColumnsMatch')}</p>
          )}
        </div>
        {restrictedCount > 0 ? <p className="text-xs text-muted-foreground">{t('reports.builder.restricted')}</p> : null}
      </div>

      {/* Selected */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-meta font-semibold text-muted-foreground">
            {t('reports.builder.selected')}
            <Badge variant={selected.length ? 'default' : 'neutral'} size="sm" className="numeric">
              {selected.length}
            </Badge>
          </h3>
          <SimpleTooltip content={selected.length ? undefined : t('reports.builder.noColumns')}>
            <span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground"
                disabled={!selected.length}
                onClick={() => onChange([])}
              >
                <XIcon />
                {t('reports.builder.clearColumns')}
              </Button>
            </span>
          </SimpleTooltip>
        </div>
        {selected.length ? (
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={value} strategy={verticalListSortingStrategy}>
              <ol className="flex max-h-[19.5rem] flex-col gap-1.5 overflow-y-auto pe-0.5">
                {selected.map((f, i) => (
                  <SortableColumn
                    key={f.key}
                    field={f}
                    index={i}
                    count={selected.length}
                    onMove={move}
                    onRemove={() => toggle(f.key, false)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-border-strong px-4 text-center text-meta text-muted-foreground">
            {t('reports.builder.noColumns')}
          </div>
        )}
      </div>
    </div>
  );
}
