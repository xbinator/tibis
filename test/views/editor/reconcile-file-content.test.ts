/**
 * @file reconcile-file-content.test.ts
 * @description 验证编辑器本地缓存与磁盘内容协调策略。
 */
import { describe, expect, it } from 'vitest';
import type { ReadFileResult } from '@/shared/platform/native/types';
import { resolveFileReconcileDecision } from '@/views/editor/utils/reconcileFileContent';

/**
 * 创建磁盘文件读取结果。
 * @param content - 文件正文内容
 * @returns 磁盘文件读取结果
 */
function createDiskFile(content: string): ReadFileResult {
  return {
    content,
    name: 'note',
    ext: 'md'
  };
}

describe('resolveFileReconcileDecision', (): void => {
  it('uses disk without confirmation when cached content is not a dirty draft', (): void => {
    const decision = resolveFileReconcileDecision({
      currentContent: 'cached content',
      savedContent: 'previous disk content',
      currentName: 'note',
      currentExt: 'md',
      diskFile: createDiskFile('new disk content'),
      diskName: 'note',
      diskExt: 'md',
      hasUnsavedDraft: false
    });

    expect(decision).toBe('applyDisk');
  });

  it('asks before replacing a dirty draft when disk content also changed', (): void => {
    const decision = resolveFileReconcileDecision({
      currentContent: 'local draft',
      savedContent: 'previous disk content',
      currentName: 'note',
      currentExt: 'md',
      diskFile: createDiskFile('new disk content'),
      diskName: 'note',
      diskExt: 'md',
      hasUnsavedDraft: true
    });

    expect(decision).toBe('askUser');
  });
});
