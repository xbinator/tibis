/**
 * @file useFileSelection.ts
 * @description editor 页面消费一次性文件选区意图并触发行范围定位。
 */

import type { EditorFile } from '../types';
import type { Ref } from 'vue';
import { nextTick, watch } from 'vue';
import type { EditorController } from '@/components/BMarkdown/types';
import { useFileSelectionIntentStore } from '@/stores/fileSelectionIntent';

/**
 * 文件选区消费 hook 参数。
 */
interface UseFileSelectionOptions {
  /** 当前编辑文件状态 */
  fileState: Ref<EditorFile>;
  /** editor 是否已就绪 */
  isEditorReady: Ref<boolean>;
  /** 当前 editor 对外暴露的公共实例 */
  editorInstance: Ref<Pick<EditorController, 'selectLineRange'> | null>;
}

/**
 * 消费一次性文件选区意图，并在目标文件就绪后触发行范围选中。
 * @param options - hook 依赖项
 */
export function useFileSelection(options: UseFileSelectionOptions): void {
  const fileSelectionIntentStore = useFileSelectionIntentStore();

  watch(
    [() => options.fileState.value.id, () => fileSelectionIntentStore.intent?.intentId, () => options.isEditorReady.value, options.editorInstance],
    async (): Promise<void> => {
      const { intent } = fileSelectionIntentStore;
      if (!intent) {
        return;
      }

      if (!options.isEditorReady.value) {
        return;
      }

      if (options.fileState.value.id !== intent.fileId) {
        return;
      }

      if (!options.editorInstance.value) {
        return;
      }

      await nextTick();

      const consumed = await options.editorInstance.value.selectLineRange(intent.startLine, intent.endLine);
      if (consumed) {
        fileSelectionIntentStore.clearIntent(intent.intentId);
      }
    },
    { immediate: true }
  );
}
