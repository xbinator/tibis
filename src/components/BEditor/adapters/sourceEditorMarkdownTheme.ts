import type { TagStyle } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const SOURCE_EDITOR_MARKDOWN_THEME_COLORS = {
  light: {
    background: '#FAF9F7',
    foreground: '#444441',
    caret: '#534AB7',
    selection: '#534AB726',
    selectionMatch: '#534AB740',
    lineHighlight: '#44444108',
    gutterForeground: '#B4B2A9',
    heading1: '#534AB7',
    heading2: '#7F77DD',
    heading3: '#AFA9EC',
    code: '#993C1D',
    link: '#0F6E56',
    quote: '#B4B2A9',
    strikethrough: '#D3D1C7'
  },
  dark: {
    background: '#1A1916',
    foreground: '#D3D1C7',
    caret: '#9F97E8',
    selection: '#3C348926',
    selectionMatch: '#3C348940',
    lineHighlight: '#88878010',
    gutterForeground: '#888780',
    heading1: '#9F97E8',
    heading2: '#AFA9EC',
    heading3: '#CECBF6',
    code: '#F0997B',
    link: '#1D9E75',
    quote: '#888780',
    strikethrough: '#5F5E5A'
  }
} as const;

export const SOURCE_EDITOR_MARKDOWN_COLOR_VARS = {
  foreground: 'var(--source-editor-markdown-foreground)',
  heading1: 'var(--source-editor-markdown-heading-1)',
  heading2: 'var(--source-editor-markdown-heading-2)',
  heading3: 'var(--source-editor-markdown-heading-3)',
  code: 'var(--source-editor-markdown-code)',
  link: 'var(--source-editor-markdown-link)',
  quote: 'var(--source-editor-markdown-quote)',
  strikethrough: 'var(--source-editor-markdown-strikethrough)'
} as const;

export const SOURCE_EDITOR_MARKDOWN_STYLE_SPECS: readonly TagStyle[] = [
  {
    tag: t.content,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.foreground
  },
  {
    tag: t.heading1,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.heading1,
    fontWeight: '600'
  },
  {
    tag: t.heading2,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.heading2,
    fontWeight: '600'
  },
  {
    tag: [t.heading3, t.heading4, t.heading5, t.heading6],
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.heading3,
    fontWeight: '600'
  },
  {
    tag: t.strong,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.foreground,
    fontWeight: '600'
  },
  {
    tag: t.emphasis,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.foreground,
    fontStyle: 'italic'
  },
  {
    tag: t.monospace,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.code
  },
  {
    tag: [t.link, t.url],
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.link
  },
  {
    tag: t.quote,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.quote,
    fontStyle: 'italic'
  },
  {
    tag: t.list,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.quote
  },
  {
    tag: [t.strikethrough, t.contentSeparator],
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.strikethrough
  },
  {
    tag: t.processingInstruction,
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.strikethrough
  }
];

export const SOURCE_EDITOR_MARKDOWN_HIGHLIGHT_STYLE = HighlightStyle.define(SOURCE_EDITOR_MARKDOWN_STYLE_SPECS, {
  all: {
    color: SOURCE_EDITOR_MARKDOWN_COLOR_VARS.foreground
  }
});

export function createSourceEditorMarkdownTheme(): Extension {
  return syntaxHighlighting(SOURCE_EDITOR_MARKDOWN_HIGHLIGHT_STYLE);
}
