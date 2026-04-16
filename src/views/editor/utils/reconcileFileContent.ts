import type { ReadFileResult } from '@/shared/platform/native/types';

export type FileReconcileAction = 'keepDraft' | 'useDisk' | 'markSaved';

export interface FileReconcileInput {
  currentContent: string;
  savedContent: string;
  currentName: string;
  currentExt: string;
  diskFile: ReadFileResult;
  diskName: string;
  diskExt: string;
}

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
