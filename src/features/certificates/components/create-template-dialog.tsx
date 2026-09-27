'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CopyIcon, FilePlus2Icon, SparklesIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { createTemplate } from '../actions';
import { createTemplateSchema, type CreateTemplateInput } from '../schemas';
import type { TemplateListItem } from '../types';
import { CERTIFICATE_LANGUAGES, CERTIFICATE_TYPES, KNOWN_VARIANTS, type CertificateType } from '../variables';
import { useActionToast } from './use-action-toast';
import { useCertificateLabels } from './use-certificate-labels';

export type CreateTemplateSeed = { source: TemplateListItem | null; defaultType?: CertificateType };

/** New template (standard wording) or duplicate of an existing one → opens the editor. */
export function CreateTemplateDialog({
  seed,
  templates,
  onOpenChange,
}: {
  /** null = closed. */
  seed: CreateTemplateSeed | null;
  templates: TemplateListItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('templates');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const labels = useCertificateLabels();
  const router = useRouter();
  const { run } = useActionToast();
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateTemplateInput>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: { name_ar: '', name_en: '', certificate_type: 'salary', variant: 'general', language: 'bilingual', sourceId: null },
  });

  useEffect(() => {
    if (!seed) return;
    const s = seed.source;
    form.reset(
      s
        ? {
            name_ar: `${s.name_ar}${t('create.copySuffixAr')}`.slice(0, 150),
            name_en: `${s.name_en}${t('create.copySuffixEn')}`.slice(0, 150),
            certificate_type: s.certificate_type,
            variant: s.variant,
            language: s.language,
            sourceId: s.id,
          }
        : { name_ar: '', name_en: '', certificate_type: seed.defaultType ?? 'salary', variant: 'general', language: 'bilingual', sourceId: null },
    );
  }, [seed, form, t]);

  const sourceId = useWatch({ control: form.control, name: 'sourceId' });
  const sortedTemplates = [...templates].sort((a, b) => localized(a, 'name', locale).localeCompare(localized(b, 'name', locale), locale));

  /** Picking a source copies its names (with a copy suffix), type, variant and language. */
  const pickSource = (id: string | null) => {
    form.setValue('sourceId', id);
    const src = templates.find((tpl) => tpl.id === id);
    if (!src) return;
    form.setValue('name_ar', `${src.name_ar}${t('create.copySuffixAr')}`.slice(0, 150), { shouldValidate: form.formState.isSubmitted });
    form.setValue('name_en', `${src.name_en}${t('create.copySuffixEn')}`.slice(0, 150), { shouldValidate: form.formState.isSubmitted });
    form.setValue('certificate_type', src.certificate_type);
    form.setValue('variant', src.variant);
    form.setValue('language', src.language);
  };
  const variant = useWatch({ control: form.control, name: 'variant' });
  const variants = Array.from(new Set<string>([...KNOWN_VARIANTS, variant]));

  const onSubmit = (values: CreateTemplateInput) =>
    startTransition(async () => {
      const result = await run(createTemplate(values), { refresh: false });
      if (result.ok && result.data) {
        onOpenChange(false);
        router.push(`/settings/document-templates/${result.data.id}`);
      }
    });

  const choice = (active: boolean) =>
    cn(
      'flex items-start gap-3 rounded-lg border p-3 text-start transition-colors',
      active ? 'border-primary bg-primary-soft/60 ring-1 ring-primary/30' : 'border-border hover:bg-accent',
    );

  return (
    <Dialog open={Boolean(seed)} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{seed?.source ? t('create.duplicateTitle') : t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="flex flex-col gap-4 pb-3">
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-medium">{t('create.startFrom')}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button type="button" className={choice(!sourceId)} onClick={() => form.setValue('sourceId', null)} aria-pressed={!sourceId}>
                    <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">{t('create.blank')}</span>
                      <span className="block text-meta text-muted-foreground">{t('create.blankHint')}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={choice(Boolean(sourceId))}
                    onClick={() => (sourceId ? undefined : pickSource(seed?.source?.id ?? sortedTemplates[0]?.id ?? null))}
                    aria-pressed={Boolean(sourceId)}
                    disabled={!templates.length}
                  >
                    <CopyIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">{t('create.copyOf')}</span>
                    </span>
                  </button>
                </div>
              </fieldset>

              {sourceId ? (
                <FormField
                  control={form.control}
                  name="sourceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('create.source')}</FormLabel>
                      <Select value={field.value ?? ''} onValueChange={(v) => pickSource(v)}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedTemplates.map((tpl) => (
                            <SelectItem key={tpl.id} value={tpl.id}>
                              {localized(tpl, 'name', locale)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.nameAr')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="rtl" maxLength={150} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.nameEn')}</FormLabel>
                      <FormControl>
                        <Input {...field} dir="ltr" maxLength={150} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="certificate_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.type')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CERTIFICATE_TYPES.map((v) => (
                            <SelectItem key={v} value={v}>
                              {labels.type(v)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="variant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.variant')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {variants.map((v) => (
                              <SelectItem key={v} value={v}>
                                {labels.variant(v)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.language')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CERTIFICATE_LANGUAGES.map((v) => (
                              <SelectItem key={v} value={v}>
                                {labels.language(v)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {tc('cancel')}
              </Button>
              <Button type="submit" loading={pending}>
                <FilePlus2Icon />
                {t('create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
