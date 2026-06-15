/**
 * @file use-save-policy.test.ts
 * @description 验证共享真实磁盘保存策略。
 */
import { effectScope, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useSavePolicy } from '@/hooks/useSavePolicy';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';

/**
 * 等待指定毫秒数。
 * @param ms - 等待时间
 * @returns Promise
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('useSavePolicy', (): void => {
  it('skips automatic disk save when strategy is off', async (): Promise<void> => {
    const scope = effectScope();
    const strategy = ref<EditorSaveStrategy>('off');
    const saveCurrentFileToDisk = vi.fn().mockResolvedValue({ status: 'saved' });

    scope.run((): void => {
      const policy = useSavePolicy({
        saveStrategy: strategy,
        hasFilePath: ref(true),
        isDirty: (): boolean => true,
        saveCurrentFileToDisk
      });

      policy.notifyContentChanged();
    });

    await wait(900);
    scope.stop();

    expect(saveCurrentFileToDisk).not.toHaveBeenCalled();
  });

  it('runs disk save on blur when strategy is onBlur', async (): Promise<void> => {
    const scope = effectScope();
    const strategy = ref<EditorSaveStrategy>('onBlur');
    const saveCurrentFileToDisk = vi.fn().mockResolvedValue({ status: 'saved' });

    await scope.run(async (): Promise<void> => {
      const policy = useSavePolicy({
        saveStrategy: strategy,
        hasFilePath: ref(true),
        isDirty: (): boolean => true,
        saveCurrentFileToDisk
      });

      await policy.handleEditorBlur();
    });
    scope.stop();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);
  });
});
