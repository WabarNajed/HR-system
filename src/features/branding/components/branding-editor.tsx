'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  EyeIcon,
  FileSignatureIcon,
  LayoutTemplateIcon,
  LogInIcon,
  PaletteIcon,
  RotateCcwIcon,
  SparklesIcon,
  StampIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/shared/color-picker';
import { FormSection } from '@/components/shared/form-section';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { StickyFormFooter } from '@/components/shared/sticky-form-footer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useUnsavedChangesWarning } from '@/features/settings/components/use-unsaved-changes';
import { localeShortNames, type Locale } from '@/lib/i18n/config';
import { brandCssVariables, cn, DEFAULT_BRAND_COLORS, normalizeHex } from '@/lib/utils';
import { saveBranding } from '../actions';
import type { BrandImageKind } from '../image-kinds';
import { brandingFormSchema, type BrandingFormValues } from '../schemas';
import { checkContrast, colorsTooSimilar, previewCss, THEME_PRESETS, type ContrastCheck } from '../theme';
import { BrandImageField } from './brand-image-field';
import { LetterPreview, LoginPreview, ShellPreview, type PreviewData, type PreviewStrings } from './brand-preview';

export type CompanyInfo = {
  nameAr: string | null;
  nameEn: string | null;
  commercialRegistration: string | null;
  vatNumber: string | null;
  addressAr: string | null;
  addressEn: string | null;
  phone: string | null;
  website: string | null;
  hrEmail: string | null;
};

export type BrandingEditorProps = {
  defaultValues: BrandingFormValues;
  images: Record<BrandImageKind, string | null>;
  company: CompanyInfo;
  canEdit: boolean;
  /** settings.administer (public logo / sign-in image uploads). */
  canAdminister: boolean;
  locale: Locale;
  previewStrings: Record<Locale, PreviewStrings>;
};

type PreviewTab = 'shell' | 'login' | 'letter';

const pick = (locale: Locale, ar: string | null | undefined, en: string | null | undefined): string | null =>
  (locale === 'ar' ? ar?.trim() || en?.trim() : en?.trim() || ar?.trim()) || null;

const BRAND_VARIABLES = [
  '--brand-primary',
  '--brand-primary-foreground',
  '--brand-primary-dark',
  '--brand-primary-dark-foreground',
  '--brand-sidebar',
  '--brand-secondary',
  '--brand-secondary-foreground',
  '--brand-secondary-dark',
  '--brand-secondary-dark-foreground',
] as const;

/**
 * Applies the saved brand colours to the running document at once (the root layout also
 * re-renders on the next request). Variables not emitted for the defaults are set to `initial`
 * so every `var(--brand-*, fallback)` returns to the Oasis palette.
 */
function applyBrandVariables(primary: string, secondary: string) {
  const vars = brandCssVariables({ primary, secondary });
  const css = `:root{${BRAND_VARIABLES.map((k) => `${k}:${vars[k] ?? 'initial'}`).join(';')}}`;
  let el = document.getElementById('brand-vars-live') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'brand-vars-live';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

/** Settings › Branding: controls (start) + sticky live preview (end). */
export function BrandingEditor({ defaultValues, images: initialImages, company, canEdit, canAdminister, locale, previewStrings }: BrandingEditorProps) {
  const t = useTranslations('settings.branding');
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [images, setImages] = useState(initialImages);
  const [tab, setTab] = useState<PreviewTab>('shell');
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);

  const form = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingFormSchema),
    defaultValues,
    mode: 'onTouched',
  });
  const dirty = form.formState.isDirty;
  useUnsavedChangesWarning(dirty && canEdit);
  const v = useWatch({ control: form.control }) as BrandingFormValues;

  const primary = normalizeHex(v.primaryColor) ?? DEFAULT_BRAND_COLORS.primary;
  const secondary = normalizeHex(v.secondaryColor) ?? DEFAULT_BRAND_COLORS.secondary;
  const primaryCheck = checkContrast(primary, 'primary');
  const secondaryCheck = checkContrast(secondary, 'secondary');
  const similar = colorsTooSimilar(primary, secondary);

  const setImage = (kind: BrandImageKind) => (url: string | null) => setImages((prev) => ({ ...prev, [kind]: url }));

  const onSubmit = (values: BrandingFormValues) =>
    startTransition(async () => {
      const result = await saveBranding(values);
      if (!result.ok) {
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof BrandingFormValues, { message: key }, { shouldFocus: true });
        }
        toast.error(resolve(result.error));
        return;
      }
      applyBrandVariables(values.primaryColor, values.secondaryColor);
      form.reset(values);
      toast.success(resolve(result.message));
    });

  const setColors = (p: string, s: string) => {
    form.setValue('primaryColor', p, { shouldDirty: true, shouldValidate: true });
    form.setValue('secondaryColor', s, { shouldDirty: true, shouldValidate: true });
  };

  const disabled = !canEdit || pending;
  const adminLock = !canEdit ? t('readOnly') : canAdminister ? null : t('adminOnly');
  const editLock = canEdit ? null : t('readOnly');

  const previewData: PreviewData = {
    locale: previewLocale,
    strings: previewStrings[previewLocale],
    portalName: pick(previewLocale, v.portalNameAr, v.portalNameEn) ?? previewStrings[previewLocale].dashboard,
    companyName: pick(previewLocale, company.nameAr, company.nameEn),
    companyOtherName: pick(previewLocale === 'ar' ? 'en' : 'ar', company.nameAr, company.nameEn),
    logoUrl: images.logo,
    loginImageUrl: images.loginImage,
    loginTitle: pick(previewLocale, v.loginTitleAr, v.loginTitleEn),
    loginSubtitle: pick(previewLocale, v.loginSubtitleAr, v.loginSubtitleEn),
    stampUrl: images.stamp,
    signatureUrl: images.signature,
    signatoryName: pick(previewLocale, v.signatoryNameAr, v.signatoryNameEn),
    signatoryTitle: pick(previewLocale, v.signatoryTitleAr, v.signatoryTitleEn),
    commercialRegistration: company.commercialRegistration,
    vatNumber: company.vatNumber,
    address: pick(previewLocale, company.addressAr, company.addressEn),
    contactLine: [company.phone, company.website, company.hrEmail].filter(Boolean).join(' · ') || null,
  };

  const pair = (nameAr: keyof BrandingFormValues, nameEn: keyof BrandingFormValues, labelAr: string, labelEn: string, multiline = false, placeholders?: [string, string]) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {(
        [
          [nameAr, labelAr, 'rtl', 'ar', placeholders?.[0]],
          [nameEn, labelEn, 'ltr', 'en', placeholders?.[1]],
        ] as const
      ).map(([name, label, dir, lang, placeholder]) => (
        <FormField
          key={name}
          control={form.control}
          name={name}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                {multiline ? (
                  <Textarea {...field} dir={dir} lang={lang} rows={2} className="min-h-16" placeholder={placeholder} />
                ) : (
                  <Input {...field} dir={dir} lang={lang} autoComplete="off" placeholder={placeholder} />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </div>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, () => toast.error(tc('form.fixErrors')))} noValidate aria-busy={pending}>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22.5rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
          {/* Controls */}
          <div className="flex min-w-0 flex-col gap-5">
            {!canEdit ? (
              <Alert variant="info">
                <EyeIcon />
                <AlertDescription>{t('readOnly')}</AlertDescription>
              </Alert>
            ) : null}
            <fieldset disabled={disabled} className="contents">
              <FormSection icon={<LayoutTemplateIcon />} title={t('sections.identity')} description={t('sections.identityHint')}>
                <div className="flex flex-col gap-4">
                  {pair('portalNameAr', 'portalNameEn', t('fields.portalNameAr'), t('fields.portalNameEn'))}
                  <BrandImageField
                    kind="logo"
                    label={t('fields.logo')}
                    description={t('fields.logoHint')}
                    url={images.logo}
                    lockedReason={adminLock}
                    onChange={setImage('logo')}
                    className="rounded-lg border border-border bg-subtle/60 p-3"
                  />
                </div>
              </FormSection>

              <FormSection
                icon={<PaletteIcon />}
                title={t('sections.colors')}
                description={t('sections.colorsHint')}
                actions={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled || (primary === DEFAULT_BRAND_COLORS.primary && secondary === DEFAULT_BRAND_COLORS.secondary)}
                    onClick={() => setColors(DEFAULT_BRAND_COLORS.primary, DEFAULT_BRAND_COLORS.secondary)}
                  >
                    <RotateCcwIcon />
                    {t('colors.reset')}
                  </Button>
                }
              >
                <div className="flex flex-col gap-5">
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-meta font-medium text-foreground">
                      <SparklesIcon className="size-3.5 text-secondary" aria-hidden />
                      {t('colors.presets')}
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {THEME_PRESETS.map((p) => {
                        const active = primary === p.primary && secondary === p.secondary;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            disabled={disabled}
                            aria-pressed={active}
                            onClick={() => setColors(p.primary, p.secondary)}
                            className={cn(
                              'group flex flex-col items-center gap-1.5 rounded-lg border bg-card p-2 text-xs transition-[border-color,box-shadow] outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60',
                              active ? 'border-primary ring-1 ring-primary' : 'border-border',
                            )}
                          >
                            <span className="flex h-6 w-full overflow-hidden rounded-md ring-1 ring-black/5">
                              <span className="flex-[2]" style={{ backgroundColor: p.primary }} />
                              <span className="flex-1" style={{ backgroundColor: p.secondary }} />
                            </span>
                            <span className="truncate text-muted-foreground group-aria-pressed:font-medium group-aria-pressed:text-foreground">{t(`colors.themes.${p.key}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="primaryColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('fields.primaryColor')}</FormLabel>
                          <FormControl>
                            <ColorPicker value={field.value} onChange={(c) => c && field.onChange(c)} disabled={disabled} presets={[]} />
                          </FormControl>
                          <FormDescription>{t('fields.primaryColorHint')}</FormDescription>
                          <ContrastBadge check={primaryCheck} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="secondaryColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('fields.secondaryColor')}</FormLabel>
                          <FormControl>
                            <ColorPicker value={field.value} onChange={(c) => c && field.onChange(c)} disabled={disabled} presets={[]} />
                          </FormControl>
                          <FormDescription>{t('fields.secondaryColorHint')}</FormDescription>
                          <ContrastBadge check={secondaryCheck} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {primaryCheck?.level === 'poor' || secondaryCheck?.level === 'poor' || similar ? (
                    <Alert variant="warning">
                      <AlertTriangleIcon />
                      <AlertDescription>
                        {similar ? t('colors.similarWarning') : t('colors.contrastWarning')}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              </FormSection>

              <FormSection icon={<LogInIcon />} title={t('sections.login')} description={t('sections.loginHint')}>
                <div className="flex flex-col gap-4">
                  <BrandImageField
                    kind="loginImage"
                    variant="wide"
                    label={t('fields.loginImage')}
                    description={t('fields.loginImageHint')}
                    url={images.loginImage}
                    lockedReason={adminLock}
                    onChange={setImage('loginImage')}
                    className="rounded-lg border border-border bg-subtle/60 p-3"
                  />
                  {pair('loginTitleAr', 'loginTitleEn', t('fields.loginTitleAr'), t('fields.loginTitleEn'), false, [
                    previewStrings.ar.defaultLoginTitle,
                    previewStrings.en.defaultLoginTitle,
                  ])}
                  {pair('loginSubtitleAr', 'loginSubtitleEn', t('fields.loginSubtitleAr'), t('fields.loginSubtitleEn'), true, [
                    previewStrings.ar.defaultLoginSubtitle,
                    previewStrings.en.defaultLoginSubtitle,
                  ])}
                </div>
              </FormSection>

              <FormSection icon={<FileSignatureIcon />} title={t('sections.certificates')} description={t('sections.certificatesHint')}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 2xl:grid-cols-2">
                    <BrandImageField
                      kind="stamp"
                      variant="stamp"
                      label={t('fields.stamp')}
                      description={t('fields.stampHint')}
                      url={images.stamp}
                      lockedReason={editLock}
                      onChange={setImage('stamp')}
                      className="rounded-lg border border-border bg-subtle/60 p-3"
                    />
                    <BrandImageField
                      kind="signature"
                      variant="stamp"
                      label={t('fields.signature')}
                      description={t('fields.signatureHint')}
                      url={images.signature}
                      lockedReason={editLock}
                      onChange={setImage('signature')}
                      className="rounded-lg border border-border bg-subtle/60 p-3"
                    />
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StampIcon className="size-3.5 shrink-0" aria-hidden />
                    {t('fields.privateHint')}
                  </p>
                  {pair('signatoryNameAr', 'signatoryNameEn', t('fields.signatoryNameAr'), t('fields.signatoryNameEn'))}
                  {pair('signatoryTitleAr', 'signatoryTitleEn', t('fields.signatoryTitleAr'), t('fields.signatoryTitleEn'))}
                </div>
              </FormSection>
            </fieldset>
          </div>

          {/* Live preview */}
          <aside id="brand-preview" className="min-w-0 scroll-mt-20 xl:sticky xl:top-[calc(var(--spacing-header)+1rem)]" aria-label={t('preview.title')}>
            <style dangerouslySetInnerHTML={{ __html: previewCss(primary, secondary) }} />
            <div data-brand-preview className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-card-title text-foreground">{t('preview.title')}</h2>
                  <p className="text-xs text-muted-foreground">{dirty ? t('preview.unsaved') : t('preview.saved')}</p>
                </div>
                <SegmentedTabs
                  size="sm"
                  aria-label={t('preview.language')}
                  value={previewLocale}
                  onValueChange={(value) => setPreviewLocale(value as Locale)}
                  items={[
                    { value: 'ar', label: localeShortNames.ar },
                    { value: 'en', label: localeShortNames.en },
                  ]}
                />
              </div>
              <SegmentedTabs
                size="sm"
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                aria-label={t('preview.title')}
                value={tab}
                onValueChange={(value) => setTab(value as PreviewTab)}
                items={[
                  { value: 'shell', label: t('preview.tabs.shell') },
                  { value: 'login', label: t('preview.tabs.login') },
                  { value: 'letter', label: t('preview.tabs.letter') },
                ]}
              />
              <div dir={previewLocale === 'ar' ? 'rtl' : 'ltr'} lang={previewLocale} className="min-w-0">
                {tab === 'shell' ? <ShellPreview data={previewData} /> : tab === 'login' ? <LoginPreview data={previewData} /> : <LetterPreview data={previewData} />}
              </div>
              <PreviewNote>{t(`preview.notes.${tab}`)}</PreviewNote>
            </div>
          </aside>
        </div>

        {canEdit ? (
          <StickyFormFooter
            className="mt-5"
            dirty={dirty}
            pending={pending}
            onCancel={dirty ? () => form.reset() : undefined}
            cancelLabel={tc('discardChanges')}
            submitDisabled={!dirty}
            start={dirty ? null : <span className="truncate">{t('footerHint')}</span>}
          />
        ) : null}
      </form>
    </Form>
  );
}

function PreviewNote({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

function ContrastBadge({ check }: { check: ContrastCheck | null }) {
  const t = useTranslations('settings.branding.colors');
  if (!check) return null;
  const ratio = check.onSurface.toFixed(1);
  const tone =
    check.level === 'good'
      ? 'bg-success-soft text-success-soft-foreground'
      : check.level === 'fair'
        ? 'bg-warning-soft text-warning-soft-foreground'
        : 'bg-danger-soft text-danger-soft-foreground';
  const Icon = check.level === 'good' ? CheckCircle2Icon : AlertTriangleIcon;
  return (
    <SimpleTooltip content={t('contrastTooltip', { surface: ratio, fill: check.onColor.toFixed(1) })}>
      <span tabIndex={0} className={cn('inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50', tone)}>
        <Icon className="size-3.5" aria-hidden />
        {t(`contrast.${check.level}`, { ratio })}
      </span>
    </SimpleTooltip>
  );
}
