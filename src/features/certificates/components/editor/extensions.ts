'use client';

import { Extension, type Extensions } from '@tiptap/react';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';
import { TokenHighlight } from './token-highlight';

const FLAG_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Keeps certificate-specific attributes through the editor:
 *  - `data-if` / `data-if-not` on blocks and tables (conditional sections for the renderer),
 *  - `dir` on blocks and table cells (bilingual letterhead cells).
 */
export const CertificateAttributes = Extension.create({
  name: 'certificateAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'table', 'bulletList', 'orderedList', 'blockquote'],
        attributes: {
          dataIf: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('data-if');
              return v && FLAG_RE.test(v) ? v : null;
            },
            renderHTML: (attrs) => (attrs.dataIf ? { 'data-if': attrs.dataIf } : {}),
          },
          dataIfNot: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('data-if-not');
              return v && FLAG_RE.test(v) ? v : null;
            },
            renderHTML: (attrs) => (attrs.dataIfNot ? { 'data-if-not': attrs.dataIfNot } : {}),
          },
        },
      },
      {
        types: ['paragraph', 'heading', 'tableCell', 'tableHeader'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('dir');
              return v === 'rtl' || v === 'ltr' ? v : null;
            },
            renderHTML: (attrs) => (attrs.dir ? { dir: attrs.dir } : {}),
          },
        },
      },
    ];
  },
});

export function certificateExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      strike: false,
      heading: { levels: [1, 2, 3] },
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['start', 'center', 'end', 'justify', 'left', 'right'],
      defaultAlignment: null,
    }),
    Table.configure({ resizable: false, HTMLAttributes: {} }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder }),
    CertificateAttributes,
    TokenHighlight,
  ];
}
