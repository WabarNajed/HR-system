'use client';

import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorContent, Extension, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { BoldIcon, Code2Icon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, PilcrowIcon, Redo2Icon, UnderlineIcon, Undo2Icon, Unlink2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Technical example shown in the link field (URL syntax, not language-specific). */
const LINK_EXAMPLE = 'https://… / {{link}}'; // i18n-ignore
const TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const TOKEN_KEY = new PluginKey('emailTokenHighlight');

/** Highlights `{{placeholders}}` (unknown ones in red). Display only — never serialized. */
const EmailTokenHighlight = Extension.create<{ known: ReadonlySet<string> }>({
  name: 'emailTokenHighlight',
  addOptions() {
    return { known: new Set<string>() };
  },
  addProseMirrorPlugins() {
    const known = this.options.known;
    const build = (doc: PMNode) => {
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        for (const match of node.text.matchAll(TOKEN_RE)) {
          const from = pos + (match.index ?? 0);
          decorations.push(
            Decoration.inline(from, from + match[0].length, {
              class: known.has(match[1] ?? '') ? 'email-token' : 'email-token email-token-unknown',
              dir: 'ltr',
            }),
          );
        }
      });
      return DecorationSet.create(doc, decorations);
    };
    return [
      new Plugin({
        key: TOKEN_KEY,
        state: { init: (_, state) => build(state.doc), apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old) },
        props: { decorations: (state) => TOKEN_KEY.getState(state) as DecorationSet },
      }),
    ];
  },
});

export type BodyEditorApi = { insert: (text: string) => void };

type Props = {
  value: string;
  onChange: (html: string) => void;
  lang: 'ar' | 'en';
  readOnly: boolean;
  known: ReadonlySet<string>;
  placeholder: string;
  /** Receives the insert API (placeholder chips). */
  onReady?: (api: BodyEditorApi) => void;
  onFocus?: () => void;
  invalid?: boolean;
  id?: string;
};

/** Email body editor: visual (TipTap) or HTML source, bilingual direction, placeholder highlighting. */
export function EmailBodyEditor({ value, onChange, lang, readOnly, known, placeholder, onReady, onFocus, invalid, id }: Props) {
  const t = useTranslations('emailTemplates.editor.toolbar');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const latest = useRef({ value, mode });
  useEffect(() => {
    latest.current = { value, mode };
  }, [value, mode]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          isAllowedUri: (url, ctx) => /^\{\{\s*[a-z_]+\s*\}\}$/.test(url) || ctx.defaultValidate(url),
        },
      }),
      Placeholder.configure({ placeholder }),
      EmailTokenHighlight.configure({ known }),
    ],
    content: value,
    editorProps: {
      attributes: {
        dir,
        lang,
        ...(id ? { id } : {}),
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'min-h-72 px-3.5 py-3 text-[0.9375rem] leading-7 text-foreground outline-none',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    onFocus: () => onFocus?.(),
  });

  useEffect(() => {
    onReady?.({
      insert: (text) => {
        if (latest.current.mode === 'html') {
          const el = htmlRef.current;
          const current = latest.current.value;
          const start = el?.selectionStart ?? current.length;
          const end = el?.selectionEnd ?? current.length;
          onChange(current.slice(0, start) + text + current.slice(end));
          requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(start + text.length, start + text.length);
          });
          return;
        }
        editor?.chain().focus().insertContent(text).run();
      },
    });
  }, [editor, onReady, onChange]);

  const switchMode = (next: 'visual' | 'html') => {
    if (next === mode) return;
    if (next === 'visual' && editor) editor.commands.setContent(value, { emitUpdate: false });
    setMode(next);
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-card shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 dark:bg-input/20',
        invalid ? 'border-danger' : 'border-input',
      )}
    >
      {mode === 'visual' ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-subtle/70 px-1.5 py-1">
          <VisualToolbar editor={editor} disabled={readOnly} />
        </div>
      ) : null}
      {mode === 'visual' ? (
        <EditorContent
          editor={editor}
          className={cn(
            '[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_h2]:my-2 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:my-2 [&_.ProseMirror_h3]:font-semibold',
            '[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ps-6 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ps-6',
            '[&_.email-token]:rounded [&_.email-token]:bg-primary-soft [&_.email-token]:px-1 [&_.email-token]:font-mono [&_.email-token]:text-[0.8125rem] [&_.email-token]:text-primary',
            '[&_.email-token-unknown]:bg-danger-soft [&_.email-token-unknown]:text-danger',
            '[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-start [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-faint-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
          )}
        />
      ) : (
        <Textarea
          ref={htmlRef}
          value={value}
          readOnly={readOnly}
          dir="ltr"
          rows={14}
          spellCheck={false}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('htmlMode')}
          className="min-h-72 rounded-none border-0 font-mono text-[0.8125rem] leading-relaxed shadow-none focus-visible:ring-0"
        />
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-subtle/70 px-2 py-1.5">
        <span className="text-xs text-muted-foreground">{mode === 'visual' ? t('visualHint') : t('htmlHint')}</span>
        <SegmentedTabs
          size="sm"
          className="ms-auto"
          aria-label={t('mode')}
          value={mode}
          onValueChange={(v) => switchMode(v as 'visual' | 'html')}
          items={[
            { value: 'visual', label: t('visual'), icon: <PilcrowIcon className="size-3.5" /> },
            { value: 'html', label: 'HTML', icon: <Code2Icon className="size-3.5" /> },
          ]}
        />
      </div>
    </div>
  );
}

function VisualToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const t = useTranslations('emailTemplates.editor.toolbar');
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      underline: e?.isActive('underline') ?? false,
      bullet: e?.isActive('bulletList') ?? false,
      ordered: e?.isActive('orderedList') ?? false,
      link: e?.isActive('link') ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });
  const off = disabled || !editor;
  const item = (label: string, icon: ReactNode, pressed: boolean, run: () => void) => (
    <SimpleTooltip content={label}>
      <Toggle size="sm" pressed={pressed} disabled={off} onPressedChange={run} aria-label={label} className="size-8 p-0">
        {icon}
      </Toggle>
    </SimpleTooltip>
  );
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {item(t('bold'), <BoldIcon />, Boolean(state?.bold), () => editor?.chain().focus().toggleBold().run())}
      {item(t('italic'), <ItalicIcon />, Boolean(state?.italic), () => editor?.chain().focus().toggleItalic().run())}
      {item(t('underline'), <UnderlineIcon />, Boolean(state?.underline), () => editor?.chain().focus().toggleUnderline().run())}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {item(t('bulletList'), <ListIcon />, Boolean(state?.bullet), () => editor?.chain().focus().toggleBulletList().run())}
      {item(t('orderedList'), <ListOrderedIcon />, Boolean(state?.ordered), () => editor?.chain().focus().toggleOrderedList().run())}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <LinkButton editor={editor} active={Boolean(state?.link)} disabled={off} />
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <SimpleTooltip content={t('undo')}>
        <Button type="button" variant="ghost" size="icon-sm" disabled={off || !state?.canUndo} onClick={() => editor?.chain().focus().undo().run()} aria-label={t('undo')}>
          <Undo2Icon className="flip-rtl" />
        </Button>
      </SimpleTooltip>
      <SimpleTooltip content={t('redo')}>
        <Button type="button" variant="ghost" size="icon-sm" disabled={off || !state?.canRedo} onClick={() => editor?.chain().focus().redo().run()} aria-label={t('redo')}>
          <Redo2Icon className="flip-rtl" />
        </Button>
      </SimpleTooltip>
    </div>
  );
}

function LinkButton({ editor, active, disabled }: { editor: Editor | null; active: boolean; disabled: boolean }) {
  const t = useTranslations('emailTemplates.editor.toolbar');
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const apply = (href: string) => {
    const value = href.trim();
    if (!editor || !value) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !active) chain.insertContent({ type: 'text', text: t('linkText'), marks: [{ type: 'link', attrs: { href: value } }] }).run();
    else chain.setLink({ href: value }).run();
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setUrl((editor?.getAttributes('link').href as string | undefined) ?? '');
      }}
    >
      <SimpleTooltip content={t('link')}>
        <PopoverTrigger asChild>
          <Toggle size="sm" pressed={active} disabled={disabled} aria-label={t('link')} className="size-8 p-0">
            <LinkIcon />
          </Toggle>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent className="w-80 p-3" align="start">
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            apply(url);
          }}
        >
          <label className="text-meta font-medium text-foreground" htmlFor="email-link-url">
            {t('linkUrl')}
          </label>
          <Input
            id="email-link-url"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={LINK_EXAMPLE}
            className="h-8 font-mono text-[0.8125rem]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={!url.trim()}>
              {t('applyLink')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => apply('{{link}}')}>
              {t('portalLink')}
            </Button>
            {active ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ms-auto text-danger"
                onClick={() => {
                  editor?.chain().focus().extendMarkRange('link').unsetLink().run();
                  setOpen(false);
                }}
              >
                <Unlink2Icon />
                {t('removeLink')}
              </Button>
            ) : null}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
