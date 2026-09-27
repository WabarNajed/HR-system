'use client';

import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Extension } from '@tiptap/react';
import { VARIABLE_KEYS } from '../../variables';

const KEY = new PluginKey('certificateTokenHighlight');
const TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function build(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const match of node.text.matchAll(TOKEN_RE)) {
      const from = pos + (match.index ?? 0);
      const to = from + match[0].length;
      decorations.push(
        Decoration.inline(from, to, {
          class: VARIABLE_KEYS.has(match[1]) ? 'tpl-token' : 'tpl-token tpl-token-unknown',
          dir: 'ltr',
        }),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

/** Highlights `{{variables}}` in the editor (unknown ones in red). Display only — not serialized. */
export const TokenHighlight = Extension.create({
  name: 'certificateTokenHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return KEY.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});
