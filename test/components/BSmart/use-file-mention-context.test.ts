/**
 * @file use-file-mention-context.test.ts
 * @description 验证文件提及上下文不会误识别文件引用 token。
 */
import type { EditorView } from '@codemirror/view';
import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue';
import { EditorState } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { useFileMention, type UseFileMentionReturn } from '@/components/BSmart/hooks/useFileMention';
import type { FileMentionOption } from '@/components/BSmart/types';

/**
 * 创建测试文件提及选项。
 * @param name - 文件名
 * @returns 文件提及选项
 */
function createFileMention(name: string): FileMentionOption {
  return {
    id: name,
    name,
    path: `src/${name}`,
    ext: name.split('.').at(-1) ?? ''
  };
}

/**
 * 创建带光标位置的编辑器状态。
 * @param doc - 文档内容
 * @param cursor - 光标位置，默认在文末
 * @returns CodeMirror 编辑器状态
 */
function createEditorState(doc: string, cursor: number = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor }
  });
}

/**
 * 创建文件提及 Hook 测试实例。
 * @returns 文件提及 Hook 返回值
 */
function createFileMentionHook(): UseFileMentionReturn {
  const view: ShallowRef<EditorView | null> = shallowRef(null);
  const fileMentions: ComputedRef<readonly FileMentionOption[]> = computed((): FileMentionOption[] => [createFileMention('note.md')]);
  const emit = vi.fn<(_event: 'file-mention-select', _file: FileMentionOption) => void>();

  return useFileMention(view, fileMentions, emit);
}

describe('useFileMention context detection', (): void => {
  it('does not open mention menu when cursor is after a file reference token', (): void => {
    const fileMention = createFileMentionHook();

    fileMention.syncMentionState(createEditorState('{{@note.md}}'), {} as EditorView);

    expect(fileMention.mentionVisible.value).toBe(false);
    expect(fileMention.mentionRange.value).toBeNull();
  });

  it('still opens mention menu for normal file mentions', (): void => {
    const fileMention = createFileMentionHook();

    fileMention.syncMentionState(createEditorState('@note'), {} as EditorView);

    expect(fileMention.mentionVisible.value).toBe(true);
    expect(fileMention.mentionRange.value).toEqual({ from: 0, to: 5 });
  });
});
