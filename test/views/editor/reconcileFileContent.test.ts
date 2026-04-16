import { describe, expect, it } from 'vitest';
import type { ReadFileResult } from '@/shared/platform/native/types';
import { resolveFileReconcileAction } from '@/views/editor/utils/reconcileFileContent';

function createDiskFile(overrides: Partial<ReadFileResult> = {}): ReadFileResult {
  return {
    content: 'disk-content',
    name: 'note.md',
    ext: 'md',
    ...overrides
  };
}

describe('resolveFileReconcileAction', () => {
  it('uses disk content when there is no draft and disk content changed', () => {
    const action = resolveFileReconcileAction({
      currentContent: 'saved-content',
      savedContent: 'saved-content',
      currentName: 'note',
      currentExt: 'md',
      diskFile: createDiskFile({ content: 'disk-updated' }),
      diskName: 'note',
      diskExt: 'md'
    });

    expect(action).toBe('useDisk');
  });

  it('keeps local draft when disk content still matches the last saved baseline', () => {
    const action = resolveFileReconcileAction({
      currentContent: 'local-draft',
      savedContent: 'saved-content',
      currentName: 'note',
      currentExt: 'md',
      diskFile: createDiskFile({ content: 'saved-content' }),
      diskName: 'note',
      diskExt: 'md'
    });

    expect(action).toBe('keepDraft');
  });

  it('marks the file as saved when disk content already matches the draft', () => {
    const action = resolveFileReconcileAction({
      currentContent: 'local-draft',
      savedContent: 'saved-content',
      currentName: 'note',
      currentExt: 'md',
      diskFile: createDiskFile({ content: 'local-draft' }),
      diskName: 'note',
      diskExt: 'md'
    });

    expect(action).toBe('markSaved');
  });

  it('uses disk content when file metadata changed without local draft changes', () => {
    const action = resolveFileReconcileAction({
      currentContent: 'saved-content',
      savedContent: 'saved-content',
      currentName: 'note',
      currentExt: 'md',
      diskFile: createDiskFile({ content: 'saved-content' }),
      diskName: 'renamed-note',
      diskExt: 'md'
    });

    expect(action).toBe('useDisk');
  });

  it('keeps local draft when disk content differs from the reopened draft', () => {
    const action = resolveFileReconcileAction({
      currentContent: 'reopened-draft',
      savedContent: 'disk-content',
      currentName: 'note',
      currentExt: 'md',
      diskFile: createDiskFile({ content: 'disk-content' }),
      diskName: 'note',
      diskExt: 'md'
    });

    expect(action).toBe('keepDraft');
  });
});
