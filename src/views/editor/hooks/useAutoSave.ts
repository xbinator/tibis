import type { EditorFile } from '../types';
import type { Ref } from 'vue';
import { watch, onUnmounted, ref } from 'vue';
import { debounce } from 'lodash-es';
import { indexedDB } from '@/utils/storage';

export interface AutoSaveOptions {
  delay?: number;
}

export function useAutoSave(fileState: Ref<EditorFile>, options: AutoSaveOptions = {}) {
  const { delay = 500 } = options;

  const isPaused = ref(false);

  async function saveToStorage() {
    if (isPaused.value) return;

    const { path, content, id } = fileState.value;

    if (!path || content === undefined) return;

    await indexedDB.updateRecentFile(id, fileState.value);
  }

  const debouncedSave = debounce(saveToStorage, delay);

  const stopWatch = watch(
    () => fileState.value.content,
    () => {
      if (!(fileState.value.path && !isPaused.value)) return;

      debouncedSave();
    }
  );

  // 暂停自动保存
  function pause(): void {
    isPaused.value = true;
  }

  // 恢复自动保存
  function resume(): void {
    isPaused.value = false;
  }

  onUnmounted(() => {
    stopWatch();

    !isPaused.value && saveToStorage();
  });

  return {
    save: saveToStorage,
    debouncedSave,
    isPaused,
    pause,
    resume
  };
}
