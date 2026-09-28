'use client';

import './editor.css';

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BracesIcon,
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  HistoryIcon,
  LockIcon,
  PanelsTopLeftIcon,
  SaveIcon,
  SendIcon,
  Settings2Icon,
  StarIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { publishTemplate, restoreTemplateVersion, saveTemplate, setDefaultTemplate, setTemplateActive } from '../../actions';
import type { TemplateDetail, TemplateDraft, TemplateVersion } from '../../types';
import { CERTIFICATE_LANGUAGES, CERTIFICATE_TYPES, findUnknownTokens, KNOWN_VARIANTS, type CertificateLanguage, type CertificateType } from '../../variables';
import { useActionToast } from '../use-action-toast';
import { useCertificateLabels } from '../use-certificate-labels';
import { EditorToolbar } from './editor-toolbar';
import { certificateExtensions } from './extensions';
import { TemplatePreviewDialog } from './template-preview-dialog';
import { VariablesPanel } from './variables-panel';
import { VersionHistorySheet } from './version-history-sheet';

type EditorKey = 'ar' | 'en' | 'header' | 'footer';
type Meta = Omit<TemplateDraft, 'content_ar' | 'content_en' | 'header_html' | 'footer_html'>;
type Pane = 'settings' | 'content' | 'variables';

const EDITOR_DIR: Record<EditorKey, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr', header: 'rtl', footer: 'rtl' };

function metaOf(t: TemplateDetail): Meta {
  return {
    name_ar: t.name_ar,
    name_en: t.name_en,
    certificate_type: t.certificate_type,
    variant: t.variant,
    language: t.language,
    show_logo: t.show_logo,
    show_stamp: t.show_stamp,
    show_signature: t.show_signature,
    show_qr: t.show_qr,
  };
}

function useCertificateEditor(
  content: string,
  key: EditorKey,
  placeholder: string,
  editable: boolean,
  onHtml: (k: EditorKey, html: string, initial: boolean) => void,
  onFocus: (k: EditorKey) => void,
) {
  const extensions = useMemo(() => certificateExtensions(placeholder), [placeholder]);
  const onHtmlRef = useRef(onHtml);
  const onFocusRef = useRef(onFocus);
  useEffect(() => {
    onHtmlRef.current = onHtml;
    onFocusRef.current = onFocus;
  });
  return useEditor({
    extensions,
    content,
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        dir: EDITOR_DIR[key],
        lang: key === 'en' ? 'en' : 'ar',
        spellcheck: 'true',
        'aria-label': placeholder,
      },
    },
    onCreate: ({ editor }) => onHtmlRef.current(key, editor.getHTML(), true),
    onUpdate: ({ editor }) => onHtmlRef.current(key, editor.getHTML(), false),
    onFocus: () => onFocusRef.current(key),
  });
}

export function TemplateEditor({ template, canEdit }: { template: TemplateDetail; canEdit: boolean }) {
  const t = useTranslations('templates');
  const te = useTranslations('templates.editor');
  const tc = useTranslations('common');
  const tcond = useTranslations('templates.conditions');
  const tCert = useTranslations('certificates.templatesTab');
  const locale = useLocale() as 'ar' | 'en';
  const labels = useCertificateLabels();
  const router = useRouter();
  const { run } = useActionToast();

  const [meta, setMeta] = useState<Meta>(() => metaOf(template));
  const [baseMeta, setBaseMeta] = useState<Meta>(() => metaOf(template));
  const initialHtml: Record<EditorKey, string> = {
    ar: template.content_ar,
    en: template.content_en,
    header: template.header_html,
    footer: template.footer_html,
  };
  /** Current HTML per editor (the editor's own serialization) and the saved baseline to diff against. */
  const [htmlState, setHtmlState] = useState<Record<EditorKey, string>>(initialHtml);
  const [baseHtml, setBaseHtml] = useState<Partial<Record<EditorKey, string>>>({});
  const [active, setActive] = useState<EditorKey>(template.language === 'en' ? 'en' : 'ar');
  const [pane, setPane] = useState<Pane>('content');
  const [saveOpen, setSaveOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  /** Destination held back by the unsaved-changes guard (back button or any in-app link). */
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  /** Versions confirmed by actions before the refreshed props arrive (the server can lag). */
  const [savedVersion, setSavedVersion] = useState(template.current_version);
  const [publishedLocal, setPublishedLocal] = useState<number | null>(template.published_version);
  const [statusPending, startStatus] = useTransition();

  const onHtml = useCallback((k: EditorKey, value: string, initial: boolean) => {
    setHtmlState((prev) => (prev[k] === value ? prev : { ...prev, [k]: value }));
    // Baseline = the editor's own normalization of the stored HTML (set once, on creation).
    if (initial) setBaseHtml((prev) => (prev[k] === undefined ? { ...prev, [k]: value } : prev));
  }, []);
  const focus = useCallback((k: EditorKey) => setActive(k), []);
  const placeholder = te('placeholder');

  const editors: Record<EditorKey, Editor | null> = {
    ar: useCertificateEditor(template.content_ar, 'ar', placeholder, canEdit, onHtml, focus),
    en: useCertificateEditor(template.content_en, 'en', placeholder, canEdit, onHtml, focus),
    header: useCertificateEditor(template.header_html, 'header', placeholder, canEdit, onHtml, focus),
    footer: useCertificateEditor(template.footer_html, 'footer', placeholder, canEdit, onHtml, focus),
  };

  const getDraft = (): TemplateDraft => ({
    ...meta,
    content_ar: editors.ar?.getHTML() ?? htmlState.ar,
    content_en: editors.en?.getHTML() ?? htmlState.en,
    header_html: editors.header?.getHTML() ?? htmlState.header,
    footer_html: editors.footer?.getHTML() ?? htmlState.footer,
  });

  const EDITOR_KEYS: EditorKey[] = ['ar', 'en', 'header', 'footer'];
  const contentDirty = EDITOR_KEYS.some((k) => baseHtml[k] !== undefined && baseHtml[k] !== htmlState[k]);
  const metaDirty = JSON.stringify(meta) !== JSON.stringify(baseMeta);
  const dirty = canEdit && (contentDirty || metaDirty);
  const unknown = findUnknownTokens(htmlState.ar, htmlState.en, htmlState.header, htmlState.footer);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // In-app navigation (sidebar, breadcrumbs, header links) never fires beforeunload: intercept
    // same-origin link clicks in the capture phase (before next/link) and confirm first.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveHref(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  // The workspace is a fixed overlay over the settings page: keep the page underneath from scrolling
  // (and from showing a second, useless scrollbar next to the editor panes).
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  const contentTabs: EditorKey[] = meta.language === 'ar' ? ['ar'] : meta.language === 'en' ? ['en'] : ['ar', 'en'];
  const allTabs: EditorKey[] = [...contentTabs, 'header', 'footer'];
  const activeKey: EditorKey = allTabs.includes(active) ? active : contentTabs[0];
  const activeEditor = editors[activeKey];
  const tabLabel: Record<EditorKey, string> = { ar: te('arabic'), en: te('english'), header: te('header'), footer: te('footer') };

  const currentVersion = Math.max(template.current_version, savedVersion);

  const markSaved = (nextMeta: Meta) => {
    const current = { ...htmlState };
    for (const k of EDITOR_KEYS) {
      const ed = editors[k];
      if (ed) current[k] = ed.getHTML();
    }
    setHtmlState(current);
    setBaseHtml(current);
    setBaseMeta(nextMeta);
  };

  const doSave = () => {
    if (!notes.trim()) {
      setNotesError(true);
      return;
    }
    startSaving(async () => {
      const draft = getDraft();
      const result = await run(saveTemplate({ id: template.id, expectedVersion: currentVersion, draft, changeNotes: notes.trim() }));
      if (result.ok) {
        if (result.data) setSavedVersion(result.data.version);
        markSaved(meta);
        setNotes('');
        setSaveOpen(false);
      }
    });
  };

  const applySnapshot = (v: TemplateVersion) => {
    const s = v.snapshot;
    const next: Meta = {
      ...meta,
      name_ar: s.name_ar ?? meta.name_ar,
      name_en: s.name_en ?? meta.name_en,
      language: (s.language as CertificateLanguage | undefined) ?? meta.language,
      show_logo: s.show_logo ?? meta.show_logo,
      show_stamp: s.show_stamp ?? meta.show_stamp,
      show_signature: s.show_signature ?? meta.show_signature,
      show_qr: s.show_qr ?? meta.show_qr,
    };
    editors.ar?.commands.setContent(s.content_ar ?? '', { emitUpdate: false });
    editors.en?.commands.setContent(s.content_en ?? '', { emitUpdate: false });
    editors.header?.commands.setContent(s.header_html ?? '', { emitUpdate: false });
    editors.footer?.commands.setContent(s.footer_html ?? '', { emitUpdate: false });
    setMeta(next);
    markSaved(next);
  };

  const insertToken = (token: string) => {
    const ed = activeEditor;
    if (!ed) return;
    ed.chain().focus().insertContent(`{{${token}}}`).run();
    if (pane === 'variables') setPane('content');
  };

  const setM = <K extends keyof Meta>(key: K, value: Meta[K]) => setMeta((m) => ({ ...m, [key]: value }));

  const published = Math.max(template.published_version ?? 0, publishedLocal ?? 0) || null;
  const justPublished = publishedLocal !== null && publishedLocal > (template.published_version ?? 0);
  const status = justPublished ? 'published' : template.status;
  const activeNow = template.is_active || justPublished;
  const publishBlocked = dirty ? te('publishDisabledUnsaved') : published === currentVersion && activeNow ? te('publishDisabledCurrent') : null;
  const title = localized(meta, 'name', locale) || localized(template, 'name', locale);

  const condVars = useMemo(() => {
    const q = (s: string) => `"${s.replace(/["\\]/g, '')}"`;
    return {
      '--cond-salary': q(tcond('salary')),
      '--cond-allowances': q(tcond('allowances')),
      '--cond-addressed-to': q(tcond('addressedTo')),
      '--cond-no-addressed-to': q(tcond('noAddressedTo')),
    } as CSSProperties;
  }, [tcond]);

  const variantOptions = Array.from(new Set<string>([...KNOWN_VARIANTS, meta.variant]));

  /* ─── Panes ─── */

  const settingsPane = (
    <div className="flex flex-col gap-5 px-4 py-4">
      <PaneSection title={te('general')}>
        <Field label={t('fields.nameAr')} htmlFor="tpl-name-ar">
          <Input id="tpl-name-ar" dir="rtl" value={meta.name_ar} onChange={(e) => setM('name_ar', e.target.value)} disabled={!canEdit} maxLength={150} />
        </Field>
        <Field label={t('fields.nameEn')} htmlFor="tpl-name-en">
          <Input id="tpl-name-en" dir="ltr" value={meta.name_en} onChange={(e) => setM('name_en', e.target.value)} disabled={!canEdit} maxLength={150} />
        </Field>
        <Field label={t('fields.type')}>
          <Select value={meta.certificate_type} onValueChange={(v) => setM('certificate_type', v as CertificateType)} disabled={!canEdit}>
            <SelectTrigger className="w-full" aria-label={t('fields.type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CERTIFICATE_TYPES.map((v) => (
                <SelectItem key={v} value={v}>
                  {labels.type(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('fields.variant')}>
          <Select value={meta.variant} onValueChange={(v) => setM('variant', v)} disabled={!canEdit}>
            <SelectTrigger className="w-full" aria-label={t('fields.variant')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variantOptions.map((v) => (
                <SelectItem key={v} value={v}>
                  {labels.variant(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('fields.language')}>
          <Select value={meta.language} onValueChange={(v) => setM('language', v as CertificateLanguage)} disabled={!canEdit}>
            <SelectTrigger className="w-full" aria-label={t('fields.language')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CERTIFICATE_LANGUAGES.map((v) => (
                <SelectItem key={v} value={v}>
                  {labels.language(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-meta text-muted-foreground">{t('fields.languageHint')}</p>
      </PaneSection>

      <PaneSection title={te('elements')}>
        <div className="divide-y divide-border rounded-md border border-border">
          {(
            [
              ['show_logo', 'showLogo'],
              ['show_stamp', 'showStamp'],
              ['show_signature', 'showSignature'],
              ['show_qr', 'showQr'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={cn('flex items-center justify-between gap-3 px-3 py-2.5', canEdit && 'cursor-pointer')}>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(`fields.${label}`)}</span>
                <span className="block text-2xs leading-4 text-muted-foreground">{t(`fields.${label}Hint`)}</span>
              </span>
              <Switch checked={meta[key]} onCheckedChange={(v) => setM(key, v)} disabled={!canEdit} />
            </label>
          ))}
        </div>
      </PaneSection>

      <PaneSection title={te('letterhead')}>
        <p className="text-meta text-muted-foreground">{te('letterheadHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActive('header');
              setPane('content');
            }}
          >
            <PanelsTopLeftIcon />
            {te('editHeader')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActive('footer');
              setPane('content');
            }}
          >
            <PanelsTopLeftIcon className="-scale-y-100" />
            {te('editFooter')}
          </Button>
        </div>
      </PaneSection>

      <PaneSection title={t('list.columns.status')}>
        <div className="flex flex-col gap-2.5 rounded-md border border-border bg-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge domain="template" status={status} size="sm" />
            {template.is_default ? (
              <Badge variant="secondary" size="sm" className="gap-1">
                <StarIcon className="size-3 fill-current" aria-hidden />
                {t('list.default')}
              </Badge>
            ) : null}
            {template.has_unpublished_changes ? (
              <Badge variant="warning" size="sm">
                {t('list.unpublished')}
              </Badge>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-meta">
            <div>
              <dt className="text-muted-foreground">{t('list.columns.version')}</dt>
              <dd className="numeric font-medium">{t('list.versionLabel', { version: currentVersion })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{te('publish')}</dt>
              <dd className="numeric font-medium">{published ? t('list.versionLabel', { version: published }) : t('list.never')}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">{t('list.columns.usage')}</dt>
              <dd className="font-medium">{tCert('issued', { count: template.issued_count })}</dd>
            </div>
          </dl>
          {canEdit ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-2.5">
              {template.published_version !== null ? (
                <Button
                  size="sm"
                  variant="outline"
                  loading={statusPending}
                  onClick={() => startStatus(async () => void (await run(setTemplateActive({ id: template.id, active: !template.is_active }))))}
                >
                  {template.is_active ? t('list.actions.deactivate') : t('list.actions.activate')}
                </Button>
              ) : null}
              {!template.is_default ? (
                <SimpleTooltip content={template.is_active && template.published_version !== null ? null : t('list.setDefaultDisabled')}>
                  <span className="inline-flex" tabIndex={template.is_active ? undefined : 0}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!template.is_active || template.published_version === null || statusPending}
                      onClick={() => startStatus(async () => void (await run(setDefaultTemplate({ id: template.id }))))}
                    >
                      <StarIcon />
                      {t('list.actions.setDefault')}
                    </Button>
                  </span>
                </SimpleTooltip>
              ) : null}
            </div>
          ) : null}
        </div>
      </PaneSection>
    </div>
  );

  const contentPane = (
    <div className="flex h-full min-h-0 flex-col" style={condVars}>
      <div className="flex items-center gap-1 border-b border-border bg-card px-3" role="tablist" aria-label={te('content')}>
        {allTabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={activeKey === k}
            onClick={() => setActive(k)}
            className={cn(
              'relative -mb-px flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
              activeKey === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              k === 'header' && 'ms-auto',
            )}
          >
            {k === 'ar' || k === 'en' ? <span className="rounded bg-muted px-1 text-2xs font-bold tracking-wide uppercase">{k}</span> : null}
            {tabLabel[k]}
          </button>
        ))}
      </div>
      <EditorToolbar editor={activeEditor} dir={EDITOR_DIR[activeKey]} disabled={!canEdit} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/50 px-3 py-4 sm:px-6 sm:py-6 dark:bg-background">
        {unknown.length ? (
          <div className="mx-auto mb-3 flex max-w-[52rem] items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-meta text-danger-soft-foreground">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {te('unknownTokens', { tokens: '' })}
              <bdi dir="ltr" className="font-mono">
                {unknown.map((u) => `{{${u}}}`).join(' ')}
              </bdi>
            </span>
          </div>
        ) : null}
        {EDITOR_KEYS.map((k) => {
          const letterhead = k === 'header' || k === 'footer';
          return (
            <div
              key={k}
              hidden={activeKey !== k}
              data-lang={k === 'en' ? 'en' : 'ar'}
              data-variant={letterhead ? 'letterhead' : 'content'}
              className={cn(
                'cert-editor mx-auto w-full max-w-[52rem] rounded-md border border-border bg-card shadow-card',
                letterhead ? 'min-h-40 px-5 py-5 sm:px-8' : 'min-h-[36rem] px-5 py-6 sm:px-12 sm:py-10',
              )}
              onClick={() => editors[k]?.commands.focus()}
            >
              {letterhead ? <p className="mb-3 border-b border-dashed border-border pb-2 text-meta text-muted-foreground">{te('letterheadHint')}</p> : null}
              <EditorContent editor={editors[k]} />
            </div>
          );
        })}
        <p className="mx-auto mt-3 flex max-w-[52rem] items-center gap-1.5 text-2xs text-muted-foreground">
          <span aria-hidden className="inline-block size-2.5 rounded-sm border-s-2 border-secondary bg-secondary-soft" />
          {te('conditionHint')}
        </p>
      </div>
    </div>
  );

  /* ─── Layout ─── */

  const backHref = '/settings/document-templates';
  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col bg-background lg:start-(--shell-sidebar) lg:transition-[inset-inline-start] lg:duration-200">
      {/* Top bar */}
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 sm:px-4">
        {dirty ? (
          <Button variant="ghost" size="icon-sm" aria-label={te('back')} onClick={() => setLeaveHref(backHref)}>
            <ArrowLeftIcon className="rtl:rotate-180" />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon-sm" aria-label={te('back')}>
            <Link href={backHref}>
              <ArrowLeftIcon className="rtl:rotate-180" />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <FileTextIcon className="size-4 shrink-0 text-primary" aria-hidden />
            <h1 className="truncate text-page-title-compact">{title}</h1>
            <StatusBadge domain="template" status={status} size="sm" className="hidden sm:inline-flex" />
            <Badge variant="outline" size="sm" className="numeric hidden shrink-0 sm:inline-flex">
              {te('versionBadge', { version: currentVersion })}
            </Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
            {labels.type(meta.certificate_type)} · {labels.variant(meta.variant)} · {labels.language(meta.language)}
            <span aria-hidden>·</span>
            {!canEdit ? (
              <span className="inline-flex items-center gap-1 text-warning">
                <LockIcon className="size-3" aria-hidden />
                {te('readOnly')}
              </span>
            ) : dirty ? (
              <span className="inline-flex items-center gap-1 font-medium text-warning">
                <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                {te('unsaved')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2Icon className="size-3" aria-hidden />
                {te('saved')}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SimpleTooltip content={te('versions')}>
            <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)} className="max-md:size-8 max-md:px-0">
              <HistoryIcon />
              <span className="hidden md:inline">{te('versions')}</span>
            </Button>
          </SimpleTooltip>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="max-md:size-8 max-md:px-0" aria-label={te('preview')}>
            <EyeIcon />
            <span className="hidden md:inline">{te('preview')}</span>
          </Button>
          {canEdit ? (
            <>
              <SimpleTooltip content={dirty ? null : te('saveDisabled')}>
                <span className="inline-flex" tabIndex={dirty ? undefined : 0}>
                  <Button size="sm" variant="secondary" disabled={!dirty} onClick={() => setSaveOpen(true)}>
                    <SaveIcon />
                    {te('save')}
                  </Button>
                </span>
              </SimpleTooltip>
              <SimpleTooltip content={publishBlocked}>
                <span className="inline-flex" tabIndex={publishBlocked ? 0 : undefined}>
                  <Button size="sm" disabled={Boolean(publishBlocked)} onClick={() => setPublishOpen(true)}>
                    <SendIcon className="rtl:-scale-x-100" />
                    {te('publish')}
                  </Button>
                </span>
              </SimpleTooltip>
            </>
          ) : null}
        </div>
      </div>

      {/* Pane switcher (< xl) */}
      <div className="shrink-0 border-b border-border bg-card px-3 py-2 xl:hidden">
        <SegmentedTabs
          size="sm"
          value={pane}
          onValueChange={(v) => setPane(v as Pane)}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          items={[
            { value: 'settings', label: te('settings'), icon: <Settings2Icon /> },
            { value: 'content', label: te('content'), icon: <FileTextIcon /> },
            { value: 'variables', label: te('variablesTab'), icon: <BracesIcon /> },
          ]}
          aria-label={te('content')}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)_17.5rem]">
        <aside
          className={cn('min-h-0 overflow-y-auto border-e border-border bg-card', pane === 'settings' ? 'block' : 'hidden', 'xl:block')}
          aria-label={te('settings')}
        >
          {settingsPane}
        </aside>
        <section className={cn('min-h-0 min-w-0', pane === 'content' ? 'block' : 'hidden', 'xl:block')} aria-label={te('content')}>
          {contentPane}
        </section>
        <aside className={cn('min-h-0 border-s border-border bg-card', pane === 'variables' ? 'block' : 'hidden', 'xl:block')} aria-label={te('variablesTab')}>
          <VariablesPanel onInsert={insertToken} targetLabel={tabLabel[activeKey]} disabled={!canEdit} />
        </aside>
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={(o) => !saving && setSaveOpen(o)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{te('saveDialogTitle')}</DialogTitle>
            <DialogDescription>{te('saveDialogDescription', { version: currentVersion + 1 })}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-1.5 pb-2">
              <Label htmlFor="tpl-notes">
                {te('changeNotes')} <span className="text-danger">*</span>
              </Label>
              <Textarea
                id="tpl-notes"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesError(false);
                }}
                placeholder={te('changeNotesPlaceholder')}
                rows={3}
                maxLength={500}
                autoFocus
                aria-invalid={notesError}
              />
              {notesError ? <p className="text-meta text-danger">{tc('required')}</p> : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button onClick={doSave} loading={saving}>
              <SaveIcon />
              {saving ? te('saving') : te('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={te('publishDialogTitle', { version: currentVersion })}
        description={te('publishDialogDescription')}
        confirmLabel={te('publish')}
        onConfirm={async () => {
          const result = await run(publishTemplate({ id: template.id }));
          if (result.ok && result.data) setPublishedLocal(result.data.version);
          return result.ok;
        }}
      />

      <ConfirmDialog
        open={leaveHref !== null}
        onOpenChange={(o) => !o && setLeaveHref(null)}
        variant="danger"
        title={te('leaveTitle')}
        description={te('leaveDescription')}
        confirmLabel={tc('discard')}
        onConfirm={() => {
          if (leaveHref) router.push(leaveHref);
        }}
      />

      <TemplatePreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} getDraft={getDraft} />

      <VersionHistorySheet
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={template.versions}
        currentVersion={currentVersion}
        publishedVersion={published}
        canRestore={canEdit && !dirty}
        restoreBlockedReason={!canEdit ? te('readOnly') : dirty ? t('versions.restoreDisabledUnsaved') : null}
        onRestore={async (v) => {
          const result = await run(restoreTemplateVersion({ id: template.id, version: v.version }));
          if (result.ok) {
            applySnapshot(v);
            if (result.data) setSavedVersion(result.data.version);
          }
          return result.ok;
        }}
      />
    </div>
  );
}

function PaneSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xs font-semibold tracking-wide text-faint-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
