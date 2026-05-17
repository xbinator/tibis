/**
 * @file editor.ts
 * @description 通用编辑驱动，首期承载 JSON 文件的 Monaco 编辑器。
 */

import type { EditorDriver } from './types';
import BEditor from '@/components/BEditor/index.vue';
import { createBaseToolContext } from './markdown';

/**
 * 通用编辑驱动。
 */
export const editorDriver: EditorDriver = {
  id: 'editor',
  match(file): boolean {
    return file.ext === 'json';
  },
  component: BEditor,
  createToolContext({ fileState, editorInstance }) {
    return createBaseToolContext(fileState, editorInstance);
  },
  toolbar: {
    showViewModeToggle: false,
    showStructuredViewToggle: false,
    showSearch: true
  }
};
