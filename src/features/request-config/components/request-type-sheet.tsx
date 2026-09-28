'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { GitBranchIcon, InfoIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/shared/color-picker';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { IconPicker } from '@/components/shared/icon-picker';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { REQUEST_CATEGORIES } from '@/features/requests/constants';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { saveRequestType } from '../actions';
import { requestTypeFormSchema, type RequestTypeFormValues } from '../schemas';
import type { RequestTypeRow } from '../types';
import { categoryLabel } from './labels';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: RequestTypeRow | null;
  /** Categories in use (custom ones included). */
  categories: string[];
  nextSortOrder: number;
  readOnly?: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 48);
}

function toValues(row: RequestTypeRow | null, nextSortOrder: number): RequestTypeFormValues {
  if (!row) {
    return {
      key: '',
      category: 'general',
      nameAr: '',
      nameEn: '',
      descriptionAr: '',
      descriptionEn: '',
      icon: 'file-text',
      color: null,
      slaBusinessDays: 3,
      sortOrder: nextSortOrder,
      requiresManagerApproval: false,
      requiresHrApproval: true,
      allowAttachments: true,
      isActive: true,
    };
  }
  return {
    key: row.key,
    category: row.category,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    descriptionAr: row.description_ar ?? '',
    descriptionEn: row.description_en ?? '',
    icon: row.icon,
    color: row.color,
    slaBusinessDays: row.sla_business_days,
    sortOrder: row.sort_order,
    requiresManagerApproval: row.requires_manager_approval,
    requiresHrApproval: row.requires_hr_approval,
    allowAttachments: row.allow_attachments,
    isActive: row.is_active,
  };
}

/** Create / edit a request type (names, icon, category, SLA, approval flags, attachments, order). */
export function RequestTypeSheet({ open, onOpenChange, row, categories, nextSortOrder, readOnly = false }: Props) {
  const t = useTranslations('requestConfig');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const keyEdited = useRef(false);

  const form = useForm<RequestTypeFormValues>({
    resolver: zodResolver(requestTypeFormSchema),
    defaultValues: toValues(row, nextSortOrder),
    mode: 'onTouched',
  });

  useEffect(() => {
    if (open) {
      form.reset(toValues(row, nextSortOrder));
      keyEdited.current = false;
    }
  }, [open, row, nextSortOrder, form]);

  const categoryOptions = useMemo(() => Array.from(new Set<string>([...REQUEST_CATEGORIES, ...categories])), [categories]);
  const customSteps = row ? row.steps.filter((s) => s.step_type === 'role' || s.step_type === 'user').length : 0;
  const mgr = useWatch({ control: form.control, name: 'requiresManagerApproval' });
  const hr = useWatch({ control: form.control, name: 'requiresHrApproval' });
  const noApprover = !mgr && !hr && customSteps === 0;

  const requestClose = () => {
    if (form.formState.isDirty && !pending) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  const onSubmit = (values: RequestTypeFormValues) => {
    if (noApprover) {
      form.setError('requiresHrApproval', { message: 'requestConfig.validation.approvalRequired' });
      return;
    }
    startTransition(async () => {
      const result = await saveRequestType({ id: row?.id ?? null, values });
      if (!result.ok) {
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof RequestTypeFormValues, { message: key }, { shouldFocus: true });
        }
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      form.reset(values);
      onOpenChange(false);
    });
  };

  const disabled = readOnly || pending;
  const formId = 'request-type-form';

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <SheetContent
          side="end"
          className="sm:max-w-xl"
          onEscapeKeyDown={(e) => {
            if (form.formState.isDirty) {
              e.preventDefault();
              requestClose();
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{row ? (readOnly ? t('types.sheet.viewTitle') : t('types.sheet.editTitle')) : t('types.sheet.createTitle')}</SheetTitle>
            <SheetDescription>{row ? localized(row, 'name', locale) : t('types.sheet.createDescription')}</SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col" noValidate>
              <SheetBody className="flex flex-col gap-5">
                <fieldset disabled={disabled} className="flex flex-col gap-4">
                  <legend className="mb-3 text-meta font-semibold text-muted-foreground">{t('types.sheet.identity')}</legend>
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
                            <Input
                              {...field}
                              dir="ltr"
                              lang="en"
                              autoComplete="off"
                              onChange={(e) => {
                                field.onChange(e);
                                if (!row && !keyEdited.current) form.setValue('key', slugify(e.target.value), { shouldValidate: form.formState.isSubmitted });
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('types.fields.key')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              dir="ltr"
                              autoComplete="off"
                              spellCheck={false}
                              readOnly={Boolean(row)}
                              className="font-mono text-[0.8125rem] read-only:bg-subtle read-only:text-muted-foreground"
                              onChange={(e) => {
                                keyEdited.current = true;
                                field.onChange(e.target.value.toLowerCase());
                              }}
                            />
                          </FormControl>
                          <FormDescription>{row ? t('types.fields.keyLocked') : t('types.fields.keyHint')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('types.fields.category')}</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categoryOptions.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {categoryLabel(tRoot, c)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="icon"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('types.fields.icon')}</FormLabel>
                          <FormControl>
                            <IconPicker value={field.value} onChange={(v) => field.onChange(v ?? 'file-text')} disabled={disabled} clearable={false} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel optional>{t('types.fields.color')}</FormLabel>
                          <FormControl>
                            <ColorPicker value={field.value} onChange={field.onChange} disabled={disabled} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </fieldset>

                <fieldset disabled={disabled} className="flex flex-col gap-4 border-t border-border pt-5">
                  <legend className="sr-only">{t('types.sheet.processing')}</legend>
                  <p aria-hidden className="text-meta font-semibold text-muted-foreground">
                    {t('types.sheet.processing')}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="slaBusinessDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel optional>{t('types.fields.sla')}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={365}
                              dir="ltr"
                              className="numeric max-w-32"
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormDescription>{t('types.fields.slaHint')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sortOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('types.fields.sortOrder')}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              dir="ltr"
                              className="numeric max-w-32"
                              value={Number.isFinite(field.value) ? field.value : ''}
                              onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormDescription>{t('types.fields.sortOrderHint')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="divide-y divide-border rounded-lg border border-border">
                    <ToggleRow form={form} name="requiresManagerApproval" label={t('types.fields.managerApproval')} hint={t('types.fields.managerApprovalHint')} disabled={disabled} />
                    <ToggleRow form={form} name="requiresHrApproval" label={t('types.fields.hrApproval')} hint={t('types.fields.hrApprovalHint')} disabled={disabled} />
                    <ToggleRow form={form} name="allowAttachments" label={t('types.fields.attachments')} hint={t('types.fields.attachmentsHint')} disabled={disabled} />
                    <ToggleRow form={form} name="isActive" label={t('types.fields.active')} hint={t('types.fields.activeHint')} disabled={disabled} />
                  </div>
                  {noApprover ? <p className="text-meta text-danger">{t('validation.approvalRequired')}</p> : null}
                  <div className="flex gap-2.5 rounded-lg bg-info-soft px-3 py-2.5 text-meta text-info-soft-foreground">
                    <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <div className="flex flex-col gap-1">
                      <span>{customSteps ? t('types.sheet.workflowSyncCustom', { count: customSteps }) : t('types.sheet.workflowSync')}</span>
                      {row ? (
                        <Link href={`/settings/workflows?type=${row.key}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          <GitBranchIcon className="size-3.5" aria-hidden />
                          {t('types.actions.editWorkflow')}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </fieldset>
              </SheetBody>
              <SheetFooter>
                <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>
                  {readOnly ? tc('close') : tc('cancel')}
                </Button>
                {readOnly ? null : (
                  <Button type="submit" form={formId} loading={pending} className="min-w-28">
                    {pending ? tc('saving') : row ? tc('saveChanges') : t('types.create')}
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
        title={tc('unsavedChanges')}
        description={tc('unsavedChangesDescription')}
        confirmLabel={tc('discardChanges')}
        cancelLabel={tc('keepEditing')}
        variant="danger"
        onConfirm={() => {
          form.reset(toValues(row, nextSortOrder));
          onOpenChange(false);
        }}
      />
    </>
  );
}

type BoolField = 'requiresManagerApproval' | 'requiresHrApproval' | 'allowAttachments' | 'isActive';

function ToggleRow({
  form,
  name,
  label,
  hint,
  disabled,
}: {
  form: ReturnType<typeof useForm<RequestTypeFormValues>>;
  name: BoolField;
  label: string;
  hint: string;
  disabled: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between gap-4 space-y-0 px-3.5 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <FormLabel className="text-sm">{label}</FormLabel>
            <FormDescription className="text-xs">{hint}</FormDescription>
          </div>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
