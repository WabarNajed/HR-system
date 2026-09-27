'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { resolveLocale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { saveMasterData, searchEmployeeOptions } from '../actions';
import { MASTER_ENTITY_CONFIG, type MasterDataRow, type MasterEntity } from '../config';
import { EMPTY_MASTER_DATA_FORM, masterDataFormSchema, type MasterDataFormValues } from '../schemas';

export type DepartmentOption = { id: string; name_ar: string | null; name_en: string | null; parent_id: string | null; is_active: boolean; code: string | null };

type Props = {
  entity: MasterEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Row being edited, or null to create. */
  row: MasterDataRow | null;
  /** Departments (for the parent picker). */
  departments: DepartmentOption[];
  /** Locations: ISO country options (localized labels). */
  countries?: ComboboxOption[];
  readOnly?: boolean;
};

function toFormValues(row: MasterDataRow | null): MasterDataFormValues {
  if (!row) return EMPTY_MASTER_DATA_FORM;
  return {
    code: row.code ?? '',
    nameAr: row.name_ar ?? '',
    nameEn: row.name_en ?? '',
    descriptionAr: row.description_ar ?? '',
    descriptionEn: row.description_en ?? '',
    city: row.city ?? '',
    country: row.country ?? '',
    parentId: row.parent_id,
    headEmployeeId: row.head_employee_id,
    isActive: row.is_active,
  };
}

/** Ids of `id` and all its descendants (a department can't move under its own subtree). */
function subtreeIds(departments: DepartmentOption[], id: string | null): Set<string> {
  const out = new Set<string>();
  if (!id) return out;
  const children = new Map<string, string[]>();
  for (const d of departments) {
    if (!d.parent_id) continue;
    children.set(d.parent_id, [...(children.get(d.parent_id) ?? []), d.id]);
  }
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return out;
}

/** Create / edit sheet shared by the four master data lists. */
export function MasterDataSheet({ entity, open, onOpenChange, row, departments, countries = [], readOnly = false }: Props) {
  const config = MASTER_ENTITY_CONFIG[entity];
  const t = useTranslations('masterData');
  const tc = useTranslations('common');
  const te = useTranslations(`masterData.entities.${config.key}`);
  const locale = resolveLocale(useLocale());
  const resolve = useErrorMessage();
  const df = useDateFormat();
  const [pending, startTransition] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const form = useForm<MasterDataFormValues>({
    resolver: zodResolver(masterDataFormSchema),
    defaultValues: toFormValues(row),
    mode: 'onTouched',
  });

  // Reset whenever the sheet opens for another row (or for a new record).
  useEffect(() => {
    if (open) form.reset(toFormValues(row));
  }, [open, row, form]);

  const parentOptions = useMemo<ComboboxOption[]>(() => {
    if (!config.hasHierarchy) return [];
    const blocked = subtreeIds(departments, row?.id ?? null);
    return departments
      .filter((d) => !blocked.has(d.id) && (d.is_active || d.id === row?.parent_id))
      .map((d) => ({
        value: d.id,
        label: localized(d, 'name', locale),
        description: d.code ?? undefined,
        keywords: [d.name_ar ?? '', d.name_en ?? '', d.code ?? ''],
      }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [config.hasHierarchy, departments, row, locale]);

  // Imported rows may hold a free-text country: keep it selectable next to the ISO list.
  const countryOptions = useMemo<ComboboxOption[]>(() => {
    const current = row?.country?.trim();
    if (!config.hasPlace || !current || countries.some((c) => c.value === current)) return countries;
    return [{ value: current, label: current }, ...countries];
  }, [config.hasPlace, countries, row]);

  const headSelected = useMemo<ComboboxOption[]>(
    () => (row?.head ? [{ value: row.head.id, label: employeeDisplayName(row.head, locale), description: row.head.employee_number ?? undefined }] : []),
    [row, locale],
  );

  const loadEmployees = useCallback(async (query: string) => {
    const result = await searchEmployeeOptions({ query });
    if (!result.ok) throw new Error(result.error);
    return (result.data ?? []).map((o) => ({ value: o.value, label: o.label, description: o.description ?? undefined }));
  }, []);

  const requestClose = () => {
    if (form.formState.isDirty && !pending) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  const onSubmit = (values: MasterDataFormValues) =>
    startTransition(async () => {
      const result = await saveMasterData({ entity, id: row?.id ?? null, values });
      if (!result.ok) {
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof MasterDataFormValues, { message: key }, { shouldFocus: true });
        }
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      form.reset(values);
      onOpenChange(false);
    });

  const disabled = readOnly || pending;
  const formId = `master-data-form-${entity}`;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <SheetContent side="end" className="sm:max-w-lg" onEscapeKeyDown={(e) => {
          if (form.formState.isDirty) {
            e.preventDefault();
            requestClose();
          }
        }}>
          <SheetHeader>
            <SheetTitle>{row ? te('editTitle') : te('createTitle')}</SheetTitle>
            <SheetDescription>{row ? localized(row, 'name', locale) : te('createDescription')}</SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form id={formId} onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col" aria-busy={pending}>
              <SheetBody className="flex flex-col gap-5">
                <fieldset disabled={disabled} className="flex flex-col gap-4">
                  <legend className="mb-3 text-meta font-semibold text-muted-foreground">{t('sheet.identity')}</legend>
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel optional>{t('fields.code')}</FormLabel>
                        <FormControl>
                          <Input {...field} dir="ltr" autoComplete="off" spellCheck={false} placeholder={te('codePlaceholder')} className="max-w-56 font-mono" />
                        </FormControl>
                        <FormDescription>{t('fields.codeHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="nameAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tc('nameAr')}</FormLabel>
                          <FormControl>
                            <Input {...field} dir="rtl" lang="ar" autoComplete="off" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nameEn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tc('nameEn')}</FormLabel>
                          <FormControl>
                            <Input {...field} dir="ltr" lang="en" autoComplete="off" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="-mt-2 text-xs text-muted-foreground">{t('fields.namesHint')}</p>
                </fieldset>

                {config.hasHierarchy ? (
                  <fieldset disabled={disabled} className="flex flex-col gap-4 border-t border-border pt-5">
                    <legend className="sr-only">{t('sheet.structure')}</legend>
                    <p aria-hidden className="text-meta font-semibold text-muted-foreground">{t('sheet.structure')}</p>
                    <FormField
                      control={form.control}
                      name="parentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel optional>{t('fields.parent')}</FormLabel>
                          <FormControl>
                            <Combobox
                              options={parentOptions}
                              value={field.value}
                              onChange={(value) => field.onChange(value)}
                              placeholder={t('fields.parentPlaceholder')}
                              searchPlaceholder={t('fields.parentSearch')}
                              disabled={disabled}
                            />
                          </FormControl>
                          <FormDescription>{t('fields.parentHint')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="headEmployeeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel optional>{t('fields.head')}</FormLabel>
                          <FormControl>
                            <Combobox
                              loadOptions={loadEmployees}
                              selectedOptions={headSelected}
                              value={field.value}
                              onChange={(value) => field.onChange(value)}
                              placeholder={t('fields.headPlaceholder')}
                              searchPlaceholder={t('fields.headSearch')}
                              disabled={disabled}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </fieldset>
                ) : null}

                {config.hasPlace ? (
                  <fieldset disabled={disabled} className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                    <legend className="sr-only">{t('sheet.place')}</legend>
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel optional>{t('fields.city')}</FormLabel>
                          <FormControl>
                            <Input {...field} autoComplete="address-level2" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel optional>{t('fields.country')}</FormLabel>
                          <FormControl>
                            <Combobox
                              options={countryOptions}
                              value={field.value || null}
                              onChange={(value) => field.onChange(value ?? '')}
                              placeholder={t('fields.countryPlaceholder')}
                              searchPlaceholder={t('fields.countrySearch')}
                              disabled={disabled}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </fieldset>
                ) : null}

                <fieldset disabled={disabled} className="flex flex-col gap-4 border-t border-border pt-5">
                  <legend className="sr-only">{t('sheet.description')}</legend>
                  <FormField
                    control={form.control}
                    name="descriptionAr"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel optional>{tc('descriptionAr')}</FormLabel>
                        <FormControl>
                          <Textarea {...field} dir="rtl" lang="ar" rows={2} className="min-h-16" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="descriptionEn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel optional>{tc('descriptionEn')}</FormLabel>
                        <FormControl>
                          <Textarea {...field} dir="ltr" lang="en" rows={2} className="min-h-16" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start justify-between gap-4 rounded-lg border border-border bg-subtle px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <FormLabel>{t('fields.active')}</FormLabel>
                        <FormDescription>{t('fields.activeHint')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {row ? (
                  <p className="text-xs text-faint-foreground">
                    {t('sheet.timestamps', { created: df.dateTime(row.created_at), updated: df.dateTime(row.updated_at) })}
                  </p>
                ) : null}
              </SheetBody>
              <SheetFooter>
                <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>
                  {readOnly ? tc('close') : tc('cancel')}
                </Button>
                {readOnly ? null : (
                  <Button type="submit" form={formId} loading={pending} className="min-w-28">
                    {pending ? tc('saving') : row ? tc('saveChanges') : te('add')}
                  </Button>
                )}
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={tc('discardChanges')}
        description={tc('unsavedChangesDescription')}
        confirmLabel={tc('discard')}
        cancelLabel={tc('keepEditing')}
        variant="danger"
        onConfirm={() => {
          form.reset(toFormValues(row));
          onOpenChange(false);
        }}
      />
    </>
  );
}
