/**
 * @file useEditorResolver.ts
 * @description BEditor 文件类型分流 hook。
 */

import type { EditorKind } from '../constants/resolver';
import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import { resolveEditorKind } from '../constants/resolver';

/**
 * 根据扩展名响应式解析编辑器实现类型。
 * @param ext - 当前文件扩展名
 * @returns 编辑器实现类型
 */
export function useEditorResolver(ext: Ref<string>): ComputedRef<EditorKind> {
  return computed<EditorKind>(() => resolveEditorKind(ext.value));
}
