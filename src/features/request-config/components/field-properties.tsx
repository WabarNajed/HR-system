'use client';

import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, EyeIcon, LockIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { REQUEST_FIELD_TYPES } from '@/features/requests/types';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import {
  canDriveRule,
  isKeyLocked,
  isTypeLocked,
  NUMERIC_TYPES,
  OPTION_TYPES,
  parseRule,
  serializeRule,
  slugifyValue,
  supportsPlaceholder,
  uniqueKey,
  type RuleCondition,
  type RuleModel,
} from '../builder-logic';
import type { BuilderField, FieldOption, LeaveTypeLite, RequestFieldType } from '../types';
import { BilingualInput } from './bilingual-input';
import { FIELD_TYPE_ICONS } from './field-type-icons';
import { fieldTypeLabel } from './labels';

type Props = {
  field: BuilderField;
  fields: BuilderField[];
  leaveTypes: LeaveTypeLite[];
  /** Option values stored before this editing session (they can't be renamed). */
  savedOptionValues: ReadonlySet<string>;
  problems: string[];
  readOnly: boolean;
  onChange: (patch: Partial<BuilderField>) => void;
};

/** Right pane of the Form Builder: every property of the selected field. */
export function FieldProperties({ field, fields, leaveTypes, savedOptionValues, problems, readOnly, onChange }: Props) {
  const t = useTranslations('requestConfig.builder');
  const tRoot = useTranslations();
  const Icon = FIELD_TYPE_ICONS[field.field_type];
  const keyLocked = isKeyLocked(field);
  const typeLocked = isTypeLocked(field);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-card-title font-semibold text-foreground">{t('properties.title')}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {fieldTypeLabel(tRoot, field.field_type)}
            {field.is_system ? (
              <SimpleTooltip content={t('systemHint')}>
                <Badge variant="outline" size="sm">
                  <LockIcon className="size-3" aria-hidden />
                  {t('system')}
                </Badge>
              </SimpleTooltip>
            ) : null}
            {field.uses ? <span>{t('usedIn', { count: field.uses })}</span> : null}
          </p>
        </div>
      </div>

      {problems.length ? (
        <ul className="flex flex-col gap-1 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-meta text-danger-soft-foreground">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-1.5">
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {tRoot(p as 'requestConfig.builder.problems.label')}
            </li>
          ))}
        </ul>
      ) : null}

      <Section title={t('properties.label')}>
        <BilingualInput
          label={t('properties.label')}
          valueAr={field.label_ar}
          valueEn={field.label_en}
          onChange={(ar, en) => onChange({ label_ar: ar, label_en: en })}
          disabled={readOnly}
          required
        />
      </Section>

      <Section title={t('properties.help')} optional>
        <BilingualInput
          label={t('properties.help')}
          valueAr={field.help_ar ?? ''}
          valueEn={field.help_en ?? ''}
          onChange={(ar, en) => onChange({ help_ar: ar, help_en: en })}
          disabled={readOnly}
          multiline
        />
      </Section>

      {supportsPlaceholder(field.field_type) ? (
        <Section title={t('properties.placeholder')} optional>
          <BilingualInput
            label={t('properties.placeholder')}
            valueAr={field.placeholder_ar ?? ''}
            valueEn={field.placeholder_en ?? ''}
            onChange={(ar, en) => onChange({ placeholder_ar: ar, placeholder_en: en })}
            disabled={readOnly}
          />
        </Section>
      ) : null}

      <Section title={t('properties.definition')}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`fk-${field.uid}`} className="text-meta text-muted-foreground">
            {t('properties.key')}
          </Label>
          <div className="relative" dir="ltr">
            <Input
              id={`fk-${field.uid}`}
              value={field.key}
              dir="ltr"
              spellCheck={false}
              autoComplete="off"
              disabled={readOnly || keyLocked}
              onChange={(e) => onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              className="h-8 pe-8 font-mono text-[0.8125rem]"
            />
            {keyLocked ? (
              <SimpleTooltip content={field.is_system ? t('properties.keySystem') : t('properties.keyUsed', { count: field.uses })}>
                <span tabIndex={0} className="absolute inset-y-0 end-2 flex items-center text-muted-foreground">
                  <LockIcon className="size-3.5" aria-label={t('properties.locked')} />
                </span>
              </SimpleTooltip>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{keyLocked ? t('properties.keyLockedHint') : t('properties.keyHint')}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-meta text-muted-foreground">{t('properties.type')}</Label>
          <SimpleTooltip content={typeLocked ? t('properties.typeLocked') : undefined}>
            <span tabIndex={typeLocked ? 0 : -1} className="block">
              <Select
                value={field.field_type}
                disabled={readOnly || typeLocked}
                onValueChange={(v) => {
                  const type = v as RequestFieldType;
                  const patch: Partial<BuilderField> = { field_type: type };
                  if (OPTION_TYPES.has(type) && !field.options.length) {
                    patch.options = [{ value: 'option_1', label_ar: field.label_ar, label_en: field.label_en }];
                  }
                  onChange(patch);
                }}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_FIELD_TYPES.map((type) => {
                    const TypeIcon = FIELD_TYPE_ICONS[type];
                    return (
                      <SelectItem key={type} value={type}>
                        <span className="flex items-center gap-2">
                          <TypeIcon className="size-3.5 text-muted-foreground" aria-hidden />
                          {fieldTypeLabel(tRoot, type)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </span>
          </SimpleTooltip>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          <SwitchRow
            label={t('properties.required')}
            hint={t('properties.requiredHint')}
            checked={field.required}
            disabled={readOnly || Boolean(field.validation.readonly)}
            onCheckedChange={(required) => onChange({ required })}
          />
          <SwitchRow
            label={t('properties.active')}
            hint={field.is_system ? t('properties.activeSystem') : t('properties.activeHint')}
            checked={field.is_active !== false}
            disabled={readOnly || Boolean(field.is_system)}
            onCheckedChange={(is_active) => onChange({ is_active })}
          />
        </div>
      </Section>

      {OPTION_TYPES.has(field.field_type) ? (
        <Section title={t('options.title')} description={t('options.description')}>
          <OptionsEditor options={field.options} savedValues={savedOptionValues} disabled={readOnly} onChange={(options) => onChange({ options })} />
        </Section>
      ) : null}

      {NUMERIC_TYPES.has(field.field_type) && !field.validation.computed ? (
        <Section title={t('limits.title')} optional>
          <div className="grid grid-cols-2 gap-2">
            {(['min', 'max'] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={`lim-${k}-${field.uid}`} className="text-meta text-muted-foreground">
                  {t(`limits.${k}`)}
                </Label>
                <Input
                  id={`lim-${k}-${field.uid}`}
                  type="number"
                  dir="ltr"
                  className="numeric h-8"
                  disabled={readOnly}
                  value={typeof field.validation[k] === 'number' ? String(field.validation[k]) : ''}
                  onChange={(e) => {
                    const next = { ...field.validation };
                    if (e.target.value === '') delete next[k];
                    else next[k] = Number(e.target.value);
                    onChange({ validation: next });
                  }}
                />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={t('rules.title')} description={t('rules.description')}>
        <VisibilityEditor field={field} fields={fields} leaveTypes={leaveTypes} disabled={readOnly} onChange={(visibility) => onChange({ visibility })} />
      </Section>
    </div>
  );
}

function Section({ title, description, optional, children }: { title: string; description?: string; optional?: boolean; children: ReactNode }) {
  const tc = useTranslations('common');
  return (
    <section className="flex flex-col gap-2.5 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {title}
          {optional ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">{tc('optionalSuffix')}</span> : null}
        </h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SwitchRow({ label, hint, checked, disabled, onCheckedChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onCheckedChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 leading-tight">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function OptionsEditor({ options, savedValues, disabled, onChange }: { options: FieldOption[]; savedValues: ReadonlySet<string>; disabled: boolean; onChange: (o: FieldOption[]) => void }) {
  const t = useTranslations('requestConfig.builder.options');
  const tc = useTranslations('common');
  const update = (i: number, patch: Partial<FieldOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {options.length ? (
        <ol className="flex flex-col gap-1.5">
          {options.map((o, i) => {
            const locked = savedValues.has(o.value);
            return (
              <li key={i} className="rounded-lg border border-border bg-subtle/60 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="numeric w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <Input
                    value={o.label_ar}
                    dir="rtl"
                    lang="ar"
                    disabled={disabled}
                    aria-label={t('labelAr', { n: i + 1 })}
                    placeholder={tc('arabic')}
                    className="h-7 min-w-0 flex-1 px-2 text-[0.8125rem]"
                    onChange={(e) => update(i, { label_ar: e.target.value })}
                  />
                  <Input
                    value={o.label_en}
                    dir="ltr"
                    lang="en"
                    disabled={disabled}
                    aria-label={t('labelEn', { n: i + 1 })}
                    placeholder={tc('english')}
                    className="h-7 min-w-0 flex-1 px-2 text-[0.8125rem]"
                    onChange={(e) => {
                      const label_en = e.target.value;
                      const patch: Partial<FieldOption> = { label_en };
                      // New options follow their English label until the value is edited by hand.
                      if (!locked && (o.value === '' || /^option_\d+$/.test(o.value) || o.value === slugifyValue(o.label_en))) {
                        const taken = new Set(options.filter((_, j) => j !== i).map((x) => x.value));
                        const slug = slugifyValue(label_en);
                        if (slug) patch.value = uniqueKey(slug, taken);
                      }
                      update(i, patch);
                    }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 ps-6.5">
                  <span className="text-[0.6875rem] text-muted-foreground">{t('value')}</span>
                  <Input
                    value={o.value}
                    dir="ltr"
                    spellCheck={false}
                    disabled={disabled || locked}
                    title={locked ? t('valueLocked') : undefined}
                    aria-label={t('valueOf', { n: i + 1 })}
                    className="h-6 min-w-0 flex-1 px-1.5 font-mono text-[0.6875rem]"
                    onChange={(e) => update(i, { value: e.target.value.replace(/\s+/g, '_') })}
                  />
                  <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={t('moveUp')}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || i === options.length - 1} onClick={() => move(i, 1)} aria-label={t('moveDown')}>
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled}
                    onClick={() => onChange(options.filter((_, j) => j !== i))}
                    aria-label={t('remove')}
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-meta text-muted-foreground">{t('empty')}</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || options.length >= 100}
        className="self-start"
        onClick={() => {
          const taken = new Set(options.map((o) => o.value));
          onChange([...options, { value: uniqueKey(`option_${options.length + 1}`, taken), label_ar: '', label_en: '' }]);
        }}
      >
        <PlusIcon />
        {t('add')}
      </Button>
    </div>
  );
}

/* ─── Visibility rules ────────────────────────────────────────────────────── */

type ValueChoice = { value: unknown; label: string };

function useValueChoices(source: BuilderField | undefined, leaveTypes: LeaveTypeLite[]): ValueChoice[] | null {
  const locale = useLocale() as Locale;
  const tc = useTranslations('common');
  return useMemo(() => {
    if (!source) return null;
    if (OPTION_TYPES.has(source.field_type)) return source.options.map((o) => ({ value: o.value, label: localized(o, 'label', locale) || o.value }));
    if (source.field_type === 'yes_no') return [{ value: true, label: tc('yes') }, { value: false, label: tc('no') }];
    if (source.field_type === 'leave_type') return leaveTypes.map((l) => ({ value: l.id, label: localized(l, 'name', locale) }));
    return null;
  }, [source, leaveTypes, locale, tc]);
}

function VisibilityEditor({
  field,
  fields,
  leaveTypes,
  disabled,
  onChange,
}: {
  field: BuilderField;
  fields: BuilderField[];
  leaveTypes: LeaveTypeLite[];
  disabled: boolean;
  onChange: (rule: BuilderField['visibility']) => void;
}) {
  const t = useTranslations('requestConfig.builder.rules');
  const locale = useLocale() as Locale;
  const model = parseRule(field.visibility);
  const sources = fields.filter((f) => f.uid !== field.uid && canDriveRule(f));

  if ('unsupported' in model) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-meta text-muted-foreground">{t('advanced')}</p>
        <pre dir="ltr" className="max-h-40 overflow-auto rounded-lg bg-muted p-2 text-start font-mono text-[0.6875rem] text-foreground">
          {JSON.stringify(model.unsupported, null, 2)}
        </pre>
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={disabled} onClick={() => onChange(null)}>
          {t('reset')}
        </Button>
      </div>
    );
  }

  const set = (next: RuleModel) => onChange(serializeRule(next));
  const conditional = model.conditions.length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <EyeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-foreground">{conditional ? t('conditional') : t('always')}</span>
        </div>
        <Switch
          checked={conditional}
          disabled={disabled || (!conditional && !sources.length)}
          aria-label={t('toggle')}
          onCheckedChange={(on) => {
            if (!on) return set({ combinator: 'all', conditions: [] });
            const first = sources[0];
            if (first) set({ combinator: 'all', conditions: [{ field: first.key, op: 'in', values: [] }] });
          }}
        />
      </div>
      {!sources.length && !conditional ? <p className="text-xs text-muted-foreground">{t('noSources')}</p> : null}

      {conditional ? (
        <>
          {model.conditions.length > 1 ? (
            <div className="flex items-center gap-2 text-meta text-muted-foreground">
              <span>{t('match')}</span>
              <Select value={model.combinator} disabled={disabled} onValueChange={(v) => set({ ...model, combinator: v as 'all' | 'any' })}>
                <SelectTrigger className="h-7 w-auto min-w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('matchAll')}</SelectItem>
                  <SelectItem value="any">{t('matchAny')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <ol className="flex flex-col gap-2">
            {model.conditions.map((c, i) => (
              <ConditionRow
                key={i}
                index={i}
                combinator={model.combinator}
                condition={c}
                sources={sources}
                leaveTypes={leaveTypes}
                disabled={disabled}
                locale={locale}
                onChange={(next) => set({ ...model, conditions: model.conditions.map((x, j) => (j === i ? next : x)) })}
                onRemove={() => set({ ...model, conditions: model.conditions.filter((_, j) => j !== i) })}
              />
            ))}
          </ol>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={disabled || model.conditions.length >= 6 || !sources.length}
            onClick={() => set({ ...model, conditions: [...model.conditions, { field: sources[0]!.key, op: 'in', values: [] }] })}
          >
            <PlusIcon />
            {t('addCondition')}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function ConditionRow({
  index,
  combinator,
  condition,
  sources,
  leaveTypes,
  disabled,
  locale,
  onChange,
  onRemove,
}: {
  index: number;
  combinator: 'all' | 'any';
  condition: RuleCondition;
  sources: BuilderField[];
  leaveTypes: LeaveTypeLite[];
  disabled: boolean;
  locale: Locale;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('requestConfig.builder.rules');
  const source = sources.find((s) => s.key === condition.field);
  const choices = useValueChoices(source, leaveTypes);
  const selected = (v: unknown) => condition.values.some((x) => x === v || String(x) === String(v));

  return (
    <li className="rounded-lg border border-border bg-subtle/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{index === 0 ? t('when') : combinator === 'any' ? t('or') : t('and')}</span>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} onClick={onRemove} aria-label={t('removeCondition')}>
          <XIcon />
        </Button>
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5">
        <Select value={source ? condition.field : undefined} disabled={disabled} onValueChange={(v) => onChange({ field: v, op: condition.op, values: [] })}>
          <SelectTrigger className="h-8 w-full text-[0.8125rem]" aria-label={t('field')}>
            <SelectValue placeholder={condition.field || t('field')} />
          </SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s.uid} value={s.key}>
                {localized(s, 'label', locale) || s.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={condition.op} disabled={disabled} onValueChange={(v) => onChange({ ...condition, op: v as 'in' | 'not_in' })}>
          <SelectTrigger className="h-8 w-full text-[0.8125rem]" aria-label={t('operator')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in">{t('in')}</SelectItem>
            <SelectItem value="not_in">{t('notIn')}</SelectItem>
          </SelectContent>
        </Select>
        {choices ? (
          choices.length ? (
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-card p-1.5">
              {choices.map((c) => {
                const id = `cv-${index}-${String(c.value)}`;
                return (
                  <label key={String(c.value)} htmlFor={id} className={cn('flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[0.8125rem] hover:bg-accent', disabled && 'cursor-not-allowed opacity-60')}>
                    <Checkbox
                      id={id}
                      checked={selected(c.value)}
                      disabled={disabled}
                      onCheckedChange={(on) =>
                        onChange({ ...condition, values: on ? [...condition.values.filter((x) => !(x === c.value || String(x) === String(c.value))), c.value] : condition.values.filter((x) => !(x === c.value || String(x) === String(c.value))) })
                      }
                    />
                    <span className="min-w-0 truncate">{c.label}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('noValues')}</p>
          )
        ) : (
          <FreeValuesInput key={condition.field} values={condition.values} disabled={disabled} onChange={(values) => onChange({ ...condition, values })} />
        )}
        {!condition.values.length ? <p className="text-xs text-warning">{t('pickValues')}</p> : null}
      </div>
    </li>
  );
}

/** Comma-separated values for free-text sources (keeps its own text so commas can be typed). */
function FreeValuesInput({ values, disabled, onChange }: { values: unknown[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const t = useTranslations('requestConfig.builder.rules');
  const [text, setText] = useState(() => values.map(String).join(', '));
  return (
    <Input
      value={text}
      disabled={disabled}
      placeholder={t('valuesPlaceholder')}
      aria-label={t('values')}
      className="h-8 text-[0.8125rem]"
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
