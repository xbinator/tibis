import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export const SOURCE_EDITOR_LAYOUT_THEME = {
  '&': {
    height: 'auto',
    minHeight: '100%'
  },
  '.cm-editor': {
    height: 'auto',
    minHeight: '100%'
  },
  '.cm-scroller': {
    overflow: 'visible'
  }
};

export function createSourceEditorLayoutTheme(): Extension {
  return EditorView.theme(SOURCE_EDITOR_LAYOUT_THEME);
}
