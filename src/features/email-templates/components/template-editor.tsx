'use client';

import { BracesIcon, ChevronDownIcon, EyeIcon, RotateCcwIcon, SaveIcon, SendIcon, TriangleAlertIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useUnsavedChangesWarning } from '@/features/request-config/components/use-unsaved';
import { extractPlaceholders, renderEmailLayout, renderTemplate, type EmailBranding, type TemplateVars } from '@/lib/email/render';
import { localeNames, type Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { saveEmailTemplate, sendTestEmail, setEmailTemplateActive } from '../actions';
import { BODY_MAX, COMMON_PLACEHOLDERS, SUBJECT_MAX, templateGroup } from '../constants';
import type { EmailTemplateRow } from '../queries';
import { EmailBodyEditor, type BodyEditorApi } from './body-editor';

export type PreviewData = { vars: TemplateVars; branding: EmailBranding; actionLabel: string; footerNote: string };

type Props = {
  template: EmailTemplateRow;
  previews: Record<Locale, PreviewData>;
  canEdit: boolean;
  userEmail: string | null;
};

type Content = Record<Locale, { subject: string; body: string }>;

function initialContent(t: EmailTemplateRow): Content {
  return { ar: { subject: t.subject_ar, body: t.body_ar }, en: { subject: t.subject_en, body: t.body_en } };
}

/** Email template editor: bilingual subject/body, placeholder chips, live branded preview, test send. */
export function TemplateEditor({ template, previews, canEdit, userEmail }: Props) {
  const t = useTranslations('emailTemplates');
  const tc = useTranslations('common');
  const uiLocale = useLocale() as Locale;
  const df = useDateFormat();
  const router = useRouter();
  const resolve = useErrorMessage();
  const [content, setContent] = useState<Content>(() => initialContent(template));
  const [lang, setLang] = useState<Locale>(uiLocale);
  const [active, setActive] = useState(template.is_active);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [version, setVersion] = useState(0);
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();
  const [toggling, startToggling] = useTransition();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyApi = useRef<BodyEditorApi | null>(null);
  const lastFocus = useRef<'subject' | 'body'>('body');

  const baseline = useMemo(() => initialContent(template), [template]);
  const dirtyLang = (l: Locale) => content[l].subject !== baseline[l].subject || content[l].body !== baseline[l].body;
  const dirty = dirtyLang('ar') || dirtyLang('en');
  useUnsavedChangesWarning(dirty);
  const readOnly = !canEdit;

  const placeholders = useMemo(() => Array.from(new Set([...template.placeholders, ...COMMON_PLACEHOLDERS])), [template.placeholders]);
  const known = useMemo(() => new Set([...placeholders, ...Object.keys(previews.ar.vars)]), [placeholders, previews.ar.vars]);
  const unknown = useMemo(
    () => Array.from(new Set([...extractPlaceholders(content[lang].subject), ...extractPlaceholders(content[lang].body)])).filter((p) => !known.has(p)),
    [content, lang, known],
  );

  const preview = previews[lang];
  const rendered = useMemo(() => {
    const subject = renderTemplate(content[lang].subject, preview.vars, { html: false });
    const html = renderEmailLayout({
      locale: lang,
      subject,
      bodyHtml: renderTemplate(content[lang].body, preview.vars),
      branding: preview.branding,
      action: { label: preview.actionLabel, url: String(preview.vars.link ?? '#') },
      footerNote: preview.footerNote,
    });
    return { subject, html };
  }, [content, lang, preview]);

  const update = (field: 'subject' | 'body', value: string) => setContent((c) => ({ ...c, [lang]: { ...c[lang], [field]: value } }));
  const updateBody = useCallback((value: string) => setContent((c) => ({ ...c, [lang]: { ...c[lang], body: value } })), [lang]);
  const registerBody = useCallback((api: BodyEditorApi) => {
    bodyApi.current = api;
  }, []);
  const focusBody = useCallback(() => {
    lastFocus.current = 'body';
  }, []);

  const insert = (token: string) => {
    const text = `{{${token}}}`;
    if (lastFocus.current === 'body') {
      bodyApi.current?.insert(text);
      return;
    }
    const el = subjectRef.current;
    const current = content[lang].subject;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    update('subject', current.slice(0, start) + text + current.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const save = () => {
    for (const l of ['ar', 'en'] as const) {
      if (!content[l].subject.trim() || !content[l].body.trim()) {
        setLang(l);
        toast.error(t('editor.required', { language: localeNames[l] }));
        return;
      }
      if (content[l].body.length > BODY_MAX || content[l].subject.length > SUBJECT_MAX) {
        setLang(l);
        toast.error(resolve(`validation.maxLength|${JSON.stringify({ max: content[l].body.length > BODY_MAX ? BODY_MAX : SUBJECT_MAX })}`));
        return;
      }
    }
    startSaving(async () => {
      const result = await saveEmailTemplate({
        key: template.key,
        subjectAr: content.ar.subject,
        subjectEn: content.en.subject,
        bodyAr: content.ar.body,
        bodyEn: content.en.body,
      });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      router.refresh();
    });
  };

  const toggleActive = (next: boolean) =>
    startToggling(async () => {
      const result = await setEmailTemplateActive({ key: template.key, active: next });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      setActive(next);
      toast.success(resolve(result.message));
      router.refresh();
    });

  const sendTest = (l: Locale) =>
    startTesting(async () => {
      if (!content[l].subject.trim() || !content[l].body.trim()) {
        toast.error(t('editor.required', { language: localeNames[l] }));
        return;
      }
      if (content[l].body.length > BODY_MAX) {
        toast.error(resolve(`validation.maxLength|${JSON.stringify({ max: BODY_MAX })}`));
        return;
      }
      const result = await sendTestEmail({ key: template.key, locale: l, subject: content[l].subject, body: content[l].body });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      if (result.data?.status === 'sent') toast.success(t('toast.testSentTo', { email: result.data.to }));
      else toast.warning(resolve(result.message));
    });

  const testDisabledReason = !canEdit ? t('provider.noPermission') : !userEmail ? t('provider.noEmail') : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        compact
        breadcrumbs={[{ label: t('title'), href: '/settings/email-templates' }, { label: localized(template, 'name', uiLocale) }]}
        title={localized(template, 'name', uiLocale)}
        titleAddon={
          <Badge variant={active ? 'success' : 'neutral'} size="sm" dot>
            {active ? tc('active') : tc('inactive')}
          </Badge>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t(`groups.${templateGroup(template.key)}`)}</span>
            <span aria-hidden>·</span>
            <span dir="ltr" className="font-mono text-xs">
              {template.key}
            </span>
            <span aria-hidden>·</span>
            <span>{t('editor.updated', { date: df.dateTime(template.updated_at) })}</span>
          </span>
        }
        actions={
          <>
            {canEdit ? (
              <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">
                <Switch checked={active} disabled={toggling} onCheckedChange={toggleActive} aria-label={t('editor.activeLabel')} />
                <span className="text-foreground">{t('editor.activeLabel')}</span>
              </label>
            ) : null}
            <SimpleTooltip content={testDisabledReason}>
              <span tabIndex={testDisabledReason ? 0 : -1}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" loading={testing} disabled={Boolean(testDisabledReason)}>
                      <SendIcon className="flip-rtl" />
                      {t('editor.sendTest')}
                      <ChevronDownIcon className="opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('editor.sendTestHint', { email: userEmail ?? '' })}</DropdownMenuLabel>
                    {(['ar', 'en'] as const).map((l) => (
                      <DropdownMenuItem key={l} onSelect={() => sendTest(l)}>
                        {t('editor.sendTestIn', { language: localeNames[l] })}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </SimpleTooltip>
            {canEdit ? (
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
            ) : null}
          </>
        }
      />

      {!active ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-meta text-warning-soft-foreground">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('editor.inactiveNote')}
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
        <SectionCard
          dense
          title={t('editor.content')}
          actions={
            <SegmentedTabs
              size="sm"
              aria-label={t('editor.language')}
              value={lang}
              onValueChange={(v) => setLang(v as Locale)}
              items={(['ar', 'en'] as const).map((l) => ({
                value: l,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {localeNames[l]}
                    {dirtyLang(l) ? <span className="size-1.5 rounded-full bg-secondary" aria-label={tc('unsavedChanges')} /> : null}
                  </span>
                ),
              }))}
            />
          }
        >
          <div className="flex flex-col gap-4 pb-1">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`subject-${lang}`}>{t('editor.subject')}</Label>
                <span className="numeric text-xs text-faint-foreground">
                  {content[lang].subject.length}/{SUBJECT_MAX}
                </span>
              </div>
              <Input
                ref={subjectRef}
                id={`subject-${lang}`}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                lang={lang}
                value={content[lang].subject}
                maxLength={SUBJECT_MAX}
                readOnly={readOnly}
                aria-invalid={!content[lang].subject.trim() || undefined}
                onFocus={() => (lastFocus.current = 'subject')}
                onChange={(e) => update('subject', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
                <BracesIcon className="size-3.5" aria-hidden />
                {t('editor.placeholders')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map((p) => {
                  const descKey = `placeholders.${p}`;
                  return (
                    <SimpleTooltip key={p} content={t.has(descKey as 'placeholders.link') ? t(descKey as 'placeholders.link') : undefined}>
                      <button
                        type="button"
                        disabled={readOnly}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insert(p)}
                        className="rounded-md border border-border bg-subtle px-2 py-0.5 font-mono text-[0.6875rem] text-foreground transition-colors outline-none hover:border-primary/50 hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
                        dir="ltr"
                      >
                        {`{{${p}}}`}
                      </button>
                    </SimpleTooltip>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t('editor.placeholdersHint')}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`body-${lang}`}>{t('editor.body')}</Label>
                <span className={cn('numeric text-xs', content[lang].body.length > BODY_MAX ? 'font-medium text-danger' : 'text-faint-foreground')}>
                  {content[lang].body.length}/{BODY_MAX}
                </span>
              </div>
              <EmailBodyEditor
                key={`${lang}-${version}`}
                id={`body-${lang}`}
                value={content[lang].body}
                onChange={updateBody}
                lang={lang}
                readOnly={readOnly}
                known={known}
                placeholder={t('editor.bodyPlaceholder')}
                invalid={!content[lang].body.trim()}
                onReady={registerBody}
                onFocus={focusBody}
              />
              <p className="text-xs text-muted-foreground">{t('editor.htmlHint')}</p>
            </div>

            {unknown.length ? (
              <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-meta text-warning-soft-foreground">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {t('editor.unknownPlaceholders')}{' '}
                  <span dir="ltr" className="font-mono">
                    {unknown.map((u) => `{{${u}}}`).join(' ')}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          dense
          title={t('editor.preview')}
          icon={<EyeIcon />}
          actions={
            <Badge variant="secondary" size="sm">
              {t('editor.sampleData')}
            </Badge>
          }
          className="xl:sticky xl:top-4"
        >
          <div className="flex flex-col gap-3 pb-1">
            <div className="rounded-lg border border-border bg-subtle px-3 py-2 text-sm">
              <span className="text-xs text-muted-foreground">{t('editor.subject')}: </span>
              <span className="font-medium text-foreground" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {rendered.subject || '—'}
              </span>
            </div>
            <iframe
              title={t('editor.previewFrame', { language: localeNames[lang] })}
              srcDoc={rendered.html}
              sandbox=""
              className={cn('h-[36rem] w-full rounded-lg border border-border bg-white')}
            />
            <p className="text-xs text-muted-foreground">{t('editor.sampleNote')}</p>
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('editor.discardTitle')}
        description={t('editor.discardDescription')}
        confirmLabel={tc('discardChanges')}
        cancelLabel={tc('keepEditing')}
        variant="danger"
        onConfirm={() => {
          setContent(baseline);
          setVersion((v) => v + 1);
          setConfirmDiscard(false);
        }}
      />
    </div>
  );
}
