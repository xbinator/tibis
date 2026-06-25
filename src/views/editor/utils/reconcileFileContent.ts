/**
 * @file reconcileFileContent.ts
 * @description 判断编辑器缓存内容、保存基线与磁盘内容之间的协调动作。
 */
import type { ReadFileResult } from '@/shared/platform/native/types';

/**
 * 文件内容协调动作。
 */
export type FileReconcileAction = 'keepDraft' | 'useDisk' | 'markSaved';

/**
 * 文件内容协调决策。
 */
export type FileReconcileDecision = 'keepDraft' | 'applyDisk' | 'markSaved' | 'askUser';

/**
 * 文件内容协调输入。
 */
export interface FileReconcileInput {
  /** 当前编辑器缓存内容 */
  currentContent: string;
  /** 最近一次保存基线内容 */
  savedContent: string;
  /** 当前缓存文件名 */
  currentName: string;
  /** 当前缓存扩展名 */
  currentExt: string;
  /** 磁盘读取结果 */
  diskFile: ReadFileResult;
  /** 磁盘文件名 */
  diskName: string;
  /** 磁盘扩展名 */
  diskExt: string;
}

/**
 * 文件内容协调决策输入。
 */
export interface FileReconcileDecisionInput extends FileReconcileInput {
  /** 当前缓存内容是否来自需要保护的未保存草稿 */
  hasUnsavedDraft: boolean;
}

/**
 * 判断磁盘状态是否与当前缓存完全一致。
 * @param input - 文件内容协调输入
 * @returns 是否一致
 */
function isDiskStateSameAsCurrent(input: FileReconcileInput): boolean {
  const { currentContent, currentName, currentExt, diskFile, diskName, diskExt } = input;

  return diskFile.content === currentContent && diskName === currentName && diskExt === currentExt;
}

/**
 * 根据三方内容差异解析基础协调动作。
 * @param input - 文件内容协调输入
 * @returns 基础协调动作
 */
export function resolveFileReconcileAction(input: FileReconcileInput): FileReconcileAction {
  const { currentContent, savedContent, currentName, currentExt, diskFile, diskName, diskExt } = input;
  const hasDraftChanges = currentContent !== savedContent;
  const diskContent = diskFile.content;
  const metaChanged = diskName !== currentName || diskExt !== currentExt;

  if (!hasDraftChanges) {
    if (diskContent !== currentContent || metaChanged) {
      return 'useDisk';
    }

    return 'markSaved';
  }

  if (diskContent === savedContent) {
    return 'keepDraft';
  }

  if (diskContent === currentContent) {
    return 'markSaved';
  }

  return 'useDisk';
}

/**
 * 根据草稿状态解析最终协调决策。
 * @param input - 文件内容协调决策输入
 * @returns 最终协调决策
 */
export function resolveFileReconcileDecision(input: FileReconcileDecisionInput): FileReconcileDecision {
  if (!input.hasUnsavedDraft) {
    return isDiskStateSameAsCurrent(input) ? 'markSaved' : 'applyDisk';
  }

  const action = resolveFileReconcileAction(input);

  if (action === 'keepDraft') {
    return 'keepDraft';
  }

  if (action === 'markSaved') {
    return 'markSaved';
  }

  if (input.currentContent === input.savedContent) {
    return 'applyDisk';
  }

  return 'askUser';
}
