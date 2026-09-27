'use client';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  Redo2Icon,
  TableIcon,
  UnderlineIcon,
  Undo2Icon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BLOCK_CONDITIONS, type BlockConditionId } from '../../variables';

type Snapshot = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  block: 'paragraph' | 'h1' | 'h2' | 'h3';
  align: string | null;
  bulletList: boolean;
  orderedList: boolean;
  inTable: boolean;
  canUndo: boolean;
  canRedo: boolean;
  condition: BlockConditionId;
};

const EMPTY: Snapshot = {
  bold: false,
  italic: false,
  underline: false,
  block: 'paragraph',
  align: null,
  bulletList: false,
  orderedList: false,
  inTable: false,
  canUndo: false,
  canRedo: false,
  condition: 'always',
};

/** Node the "show block" condition applies to: the table when inside one, else the text block. */
function conditionTarget(editor: Editor): 'table' | 'heading' | 'paragraph' {
  if (editor.isActive('table')) return 'table';
  if (editor.isActive('heading')) return 'heading';
  return 'paragraph';
}

function readCondition(editor: Editor): BlockConditionId {
  const attrs = editor.getAttributes(conditionTarget(editor)) as { dataIf?: string | null; dataIfNot?: string | null };
  const found = BLOCK_CONDITIONS.find(
    (c) => (c.attr === 'data-if' && attrs.dataIf === c.flag) || (c.attr === 'data-if-not' && attrs.dataIfNot === c.flag),
  );
  return found?.id ?? 'always';
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <SimpleTooltip content={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn('text-muted-foreground', active && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary')}
      >
        {children}
      </Button>
    </SimpleTooltip>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

/** Formatting toolbar bound to the active editor (Arabic / English / header / footer). */
export function EditorToolbar({ editor, dir, disabled }: { editor: Editor | null; dir: 'rtl' | 'ltr'; disabled?: boolean }) {
  const t = useTranslations('templates.toolbar');
  const tc = useTranslations('templates.conditions');
  const s =
    useEditorState({
      editor,
      selector: ({ editor: e }): Snapshot => {
        if (!e) return EMPTY;
        return {
          bold: e.isActive('bold'),
          italic: e.isActive('italic'),
          underline: e.isActive('underline'),
          block: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph',
          align: (e.getAttributes(e.isActive('heading') ? 'heading' : 'paragraph').textAlign as string | null) ?? null,
          bulletList: e.isActive('bulletList'),
          orderedList: e.isActive('orderedList'),
          inTable: e.isActive('table'),
          canUndo: e.can().undo(),
          canRedo: e.can().redo(),
          condition: readCondition(e),
        };
      },
    }) ?? EMPTY;

  const off = disabled || !editor;
  const chain = () => editor!.chain().focus();
  const StartIcon = dir === 'rtl' ? AlignRightIcon : AlignLeftIcon;
  const EndIcon = dir === 'rtl' ? AlignLeftIcon : AlignRightIcon;
  const isAlign = (v: string) => s.align === v || (v === 'start' && s.align === (dir === 'rtl' ? 'right' : 'left')) || (v === 'end' && s.align === (dir === 'rtl' ? 'left' : 'right'));

  const blockLabel = { paragraph: t('paragraph'), h1: t('heading1'), h2: t('heading2'), h3: t('heading3') }[s.block];

  const setCondition = (id: BlockConditionId) => {
    if (!editor) return;
    const target = conditionTarget(editor);
    const def = BLOCK_CONDITIONS.find((c) => c.id === id);
    const attrs = {
      dataIf: def?.attr === 'data-if' ? def.flag : null,
      dataIfNot: def?.attr === 'data-if-not' ? def.flag : null,
    };
    editor.chain().focus().updateAttributes(target, attrs).run();
  };

  return (
    <div
      role="toolbar"
      aria-label={t('textStyle')}
      className="scrollbar-none flex min-h-11 items-center gap-0.5 overflow-x-auto border-b border-border bg-card px-2 py-1.5"
    >
      <ToolButton label={t('undo')} disabled={off || !s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2Icon className="rtl:-scale-x-100" />
      </ToolButton>
      <ToolButton label={t('redo')} disabled={off || !s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2Icon className="rtl:-scale-x-100" />
      </ToolButton>
      <Divider />
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={off}>
          <Button type="button" variant="ghost" size="sm" className="w-28 shrink-0 justify-between px-2 font-normal text-muted-foreground" onMouseDown={(e) => e.preventDefault()}>
            <span className="truncate">{blockLabel}</span>
            <ChevronDownIcon className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => chain().setParagraph().run()}>
            {t('paragraph')}
            {s.block === 'paragraph' ? <CheckIcon className="ms-auto" /> : null}
          </DropdownMenuItem>
          {([1, 2, 3] as const).map((level) => (
            <DropdownMenuItem key={level} onSelect={() => chain().setHeading({ level }).run()}>
              <span className={cn('font-semibold', level === 1 ? 'text-base' : level === 2 ? 'text-[0.9375rem]' : 'text-sm')}>{t(`heading${level}`)}</span>
              {s.block === `h${level}` ? <CheckIcon className="ms-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />
      <ToolButton label={t('bold')} active={s.bold} disabled={off} onClick={() => chain().toggleBold().run()}>
        <BoldIcon />
      </ToolButton>
      <ToolButton label={t('italic')} active={s.italic} disabled={off} onClick={() => chain().toggleItalic().run()}>
        <ItalicIcon />
      </ToolButton>
      <ToolButton label={t('underline')} active={s.underline} disabled={off} onClick={() => chain().toggleUnderline().run()}>
        <UnderlineIcon />
      </ToolButton>
      <Divider />
      <ToolButton label={t('alignStart')} active={isAlign('start')} disabled={off} onClick={() => chain().setTextAlign('start').run()}>
        <StartIcon />
      </ToolButton>
      <ToolButton label={t('alignCenter')} active={s.align === 'center'} disabled={off} onClick={() => chain().setTextAlign('center').run()}>
        <AlignCenterIcon />
      </ToolButton>
      <ToolButton label={t('alignEnd')} active={isAlign('end')} disabled={off} onClick={() => chain().setTextAlign('end').run()}>
        <EndIcon />
      </ToolButton>
      <ToolButton label={t('justify')} active={s.align === 'justify'} disabled={off} onClick={() => chain().setTextAlign('justify').run()}>
        <AlignJustifyIcon />
      </ToolButton>
      <Divider />
      <ToolButton label={t('bulletList')} active={s.bulletList} disabled={off} onClick={() => chain().toggleBulletList().run()}>
        <ListIcon />
      </ToolButton>
      <ToolButton label={t('orderedList')} active={s.orderedList} disabled={off} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrderedIcon />
      </ToolButton>
      <DropdownMenu>
        <SimpleTooltip content={t('table')}>
          <DropdownMenuTrigger asChild disabled={off}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('table')}
              className={cn('text-muted-foreground', s.inTable && 'bg-primary-soft text-primary')}
              onMouseDown={(e) => e.preventDefault()}
            >
              <TableIcon />
            </Button>
          </DropdownMenuTrigger>
        </SimpleTooltip>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => chain().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).run()}>{t('insertTable')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().addRowAfter().run()}>
            {t('addRow')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().addColumnAfter().run()}>
            {t('addColumn')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().toggleHeaderCell().run()}>
            {t('toggleHeaderCell')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().deleteRow().run()}>
            {t('deleteRow')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!s.inTable} onSelect={() => chain().deleteColumn().run()}>
            {t('deleteColumn')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={!s.inTable} onSelect={() => chain().deleteTable().run()}>
            {t('deleteTable')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolButton label={t('horizontalRule')} disabled={off} onClick={() => chain().setHorizontalRule().run()}>
        <MinusIcon />
      </ToolButton>
      <Divider />
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={off}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('shrink-0 gap-1.5 px-2 font-normal text-muted-foreground', s.condition !== 'always' && 'bg-secondary-soft text-secondary-soft-foreground')}
            onMouseDown={(e) => e.preventDefault()}
          >
            <EyeIcon className="size-4" />
            <span className="max-w-40 truncate">{s.condition === 'always' ? t('condition') : tc(s.condition)}</span>
            <ChevronDownIcon className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{t('condition')}</DropdownMenuLabel>
          {BLOCK_CONDITIONS.map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => setCondition(c.id)}>
              {tc(c.id)}
              {s.condition === c.id ? <CheckIcon className="ms-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
