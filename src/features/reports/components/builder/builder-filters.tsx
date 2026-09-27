'use client';

import { FilterIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Combobox } from '@/components/shared/combobox';
import { DatePicker } from '@/components/shared/date-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  BUILDER_LIMITS,
  OPERATORS,
  VALUELESS_OPERATORS,
  type BuilderField,
  type BuilderFilter,
  type ReferenceList,
} from '../../builder/sources';
import type { FacetOption } from '../facet-filter';
import { tOr, useReportT, type LooseT } from '../format';

type Props = {
  fields: BuilderField[];
  value: BuilderFilter[];
  onChange: (next: BuilderFilter[]) => void;
  references: Partial<Record<ReferenceList, FacetOption[]>>;
  /** Show validation state on incomplete rows. */
  showErrors: boolean;
};

export function isFilterComplete(filter: BuilderFilter): boolean {
  if (!filter.field || !filter.op) return false;
  if (VALUELESS_OPERATORS.has(filter.op)) return true;
  if (Array.isArray(filter.value)) return filter.value.length > 0;
  return typeof filter.value === 'string' && filter.value.trim() !== '';
}

function optionsFor(field: BuilderField, references: Props['references'], t: LooseT): FacetOption[] {
  if (field.type === 'reference' && field.reference) return references[field.reference] ?? [];
  const values = field.values ?? [];
  if (field.type === 'status')
    return values.map((v) => ({
      value: v,
      label: tOr(t, `statuses.${field.statusDomain}.${v}`, v),
    }));
  return values.map((v) => ({
    value: v,
    label: tOr(t, `enums.${field.enumKey}.${v}`, v),
  }));
}

/** Filter rows: field · condition · value (inputs adapt to the field type). */
export function BuilderFilters({ fields, value, onChange, references, showErrors }: Props) {
  const t = useReportT();
  const filterable = fields.filter((f) => f.filter);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const update = (index: number, patch: Partial<BuilderFilter>) => onChange(value.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => {
    const first = filterable[0];
    if (!first?.filter) return;
    onChange([...value, { field: first.key, op: OPERATORS[first.filter][0]!, value: null }]);
  };

  const sections = Array.from(new Set(filterable.map((f) => f.section)));

  return (
    <div className="flex flex-col gap-2.5">
      {value.length ? (
        <ul className="flex flex-col gap-2">
          {value.map((flt, index) => {
            const field = byKey.get(flt.field);
            const kind = field?.filter;
            const invalid = showErrors && !isFilterComplete(flt);
            return (
              <li
                key={index}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)_auto] gap-2 rounded-md border border-border bg-subtle/40 p-2',
                  invalid && 'border-danger/50 bg-danger-soft/30',
                )}
              >
                <Select
                  value={flt.field}
                  onValueChange={(key) => {
                    const next = byKey.get(key);
                    if (!next?.filter) return;
                    update(index, {
                      field: key,
                      op: OPERATORS[next.filter][0]!,
                      value: null,
                    });
                  }}
                >
                  <SelectTrigger size="sm" className="w-full min-w-0 bg-card" aria-label={t('reports.builder.filterField')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectGroup key={section}>
                        <SelectLabel>{t(`reports.builder.sections.${section}`)}</SelectLabel>
                        {filterable
                          .filter((f) => f.section === section)
                          .map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {t(`reports.builder.fields.${f.labelId}`)}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={flt.op}
                  onValueChange={(op) =>
                    update(index, {
                      op,
                      value: VALUELESS_OPERATORS.has(op) ? null : flt.value,
                    })
                  }
                >
                  <SelectTrigger size="sm" className="w-full min-w-0 bg-card" aria-label={t('reports.builder.filterOperator')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(kind ? OPERATORS[kind] : []).map((op) => (
                      <SelectItem key={op} value={op}>
                        {t(`reports.builder.operators.${op}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-danger"
                  onClick={() => remove(index)}
                  aria-label={t('reports.builder.removeFilter')}
                >
                  <Trash2Icon />
                </Button>

                <div className="col-span-3 min-w-0 empty:hidden">
                  {!field || VALUELESS_OPERATORS.has(flt.op) ? null : kind === 'options' ? (
                    <Combobox
                      multiple
                      size="sm"
                      className="bg-card"
                      options={optionsFor(field, references, t)}
                      value={Array.isArray(flt.value) ? flt.value : flt.value ? [flt.value] : []}
                      onChange={(v) =>
                        update(index, {
                          value: v.slice(0, BUILDER_LIMITS.listValues),
                        })
                      }
                      placeholder={t('reports.builder.selectValues')}
                      aria-invalid={invalid}
                    />
                  ) : kind === 'date' ? (
                    <DatePicker
                      value={typeof flt.value === 'string' ? flt.value : null}
                      onChange={(v) => update(index, { value: v })}
                      placeholder={t('reports.builder.pickDate')}
                      className="[&_button]:h-8 [&_button]:bg-card [&_button]:text-meta"
                      aria-invalid={invalid}
                    />
                  ) : (
                    <Input
                      className="h-8 bg-card text-meta"
                      type={kind === 'number' ? 'number' : 'text'}
                      inputMode={kind === 'number' ? 'decimal' : undefined}
                      maxLength={BUILDER_LIMITS.valueLength}
                      value={typeof flt.value === 'string' ? flt.value : ''}
                      onChange={(e) => update(index, { value: e.target.value })}
                      placeholder={kind === 'number' ? t('reports.builder.enterNumber') : t('reports.builder.enterValue')}
                      aria-label={t('reports.builder.filterValue')}
                      aria-invalid={invalid}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-2.5 rounded-md border border-dashed border-border-strong px-3 py-3 text-meta text-muted-foreground">
          <FilterIcon className="size-4 shrink-0" />
          {t('reports.builder.noFilters')}
        </div>
      )}
      <div>
        <Button variant="outline" size="sm" onClick={add} disabled={value.length >= BUILDER_LIMITS.filters || !filterable.length}>
          <PlusIcon />
          {t('reports.builder.addFilter')}
        </Button>
      </div>
    </div>
  );
}
