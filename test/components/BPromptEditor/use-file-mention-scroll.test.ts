/**
 * @file use-file-mention-scroll.test.ts
 * @description 验证文件提及菜单区分键盘导航和鼠标悬停的滚动状态。
 */
import type { EditorView } from '@codemirror/view';
import { computed, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useFileMention, type UseFileMentionReturn } from '@/components/BPromptEditor/hooks/useFileMention';
import type { FileMentionOption } from '@/components/BPromptEditor/types';

/**
 * 带滚动标记的文件提及 Hook 返回值。
 */
type UseFileMentionReturnWithScroll = UseFileMentionReturn & {
  /** 当前活动项是否需要因键盘导航滚动到可视区 */
  mentionShouldScrollActive: Ref<boolean>;
};

/**
 * 创建测试文件提及选项。
 * @param index - 文件序号
 * @returns 文件提及选项
 */
function createFileMention(index: number): FileMentionOption {
  return {
    id: `file-${index}`,
    name: `file-${index}.ts`,
    path: `src/file-${index}.ts`,
    ext: 'ts'
  };
}

/**
 * 创建文件提及 Hook 测试实例。
 * @returns 文件提及 Hook 返回值
 */
function createFileMentionHook(): UseFileMentionReturnWithScroll {
  const view: ShallowRef<EditorView | null> = shallowRef(null);
  const fileMentions: ComputedRef<readonly FileMentionOption[]> = computed((): FileMentionOption[] => [
    createFileMention(0),
    createFileMention(1),
    createFileMention(2)
  ]);
  const emit = vi.fn<(_event: 'file-mention-select', _file: FileMentionOption) => void>();

  return useFileMention(view, fileMentions, emit) as UseFileMentionReturnWithScroll;
}

describe('useFileMention active item scrolling source', (): void => {
  it('marks active item scrolling only for keyboard navigation', (): void => {
    const fileMention = createFileMentionHook();

    fileMention.mentionVisible.value = true;
    fileMention.handleMentionArrowDown();

    expect(fileMention.mentionActiveIndex.value).toBe(1);
    expect(fileMention.mentionShouldScrollActive.value).toBe(true);

    fileMention.handleMentionActiveIndexChange(2);

    expect(fileMention.mentionActiveIndex.value).toBe(2);
    expect(fileMention.mentionShouldScrollActive.value).toBe(false);
  });
});
