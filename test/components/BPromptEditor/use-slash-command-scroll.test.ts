/**
 * @file use-slash-command-scroll.test.ts
 * @description 验证斜杠命令菜单区分键盘导航和鼠标悬停的滚动状态。
 */
import type { EditorView } from '@codemirror/view';
import { computed, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useSlashCommand, type UseSlashCommandReturn } from '@/components/BPromptEditor/hooks/useSlashCommand';
import type { SlashCommandOption, SlashCommandId } from '@/components/BPromptEditor/types';

/**
 * 带滚动标记的斜杠命令 Hook 返回值。
 */
type UseSlashCommandReturnWithScroll = UseSlashCommandReturn & {
  /** 当前活动项是否需要因键盘导航滚动到可视区 */
  slashShouldScrollActive: Ref<boolean>;
};

/**
 * 创建测试斜杠命令选项。
 * @param id - 命令 ID
 * @returns 斜杠命令选项
 */
function createSlashCommand(id: SlashCommandId): SlashCommandOption {
  return {
    id,
    trigger: `/${id}`,
    title: id,
    description: `Run ${id}`,
    type: 'action'
  };
}

/**
 * 创建斜杠命令 Hook 测试实例。
 * @returns 斜杠命令 Hook 返回值
 */
function createSlashCommandHook(): UseSlashCommandReturnWithScroll {
  const view: ShallowRef<EditorView | null> = shallowRef(null);
  const slashCommands: ComputedRef<readonly SlashCommandOption[]> = computed((): SlashCommandOption[] => [
    createSlashCommand('model'),
    createSlashCommand('usage'),
    createSlashCommand('new')
  ]);
  const emit = vi.fn<(_event: 'slash-command', _command: SlashCommandOption) => void>();

  return useSlashCommand(view, slashCommands, emit) as UseSlashCommandReturnWithScroll;
}

describe('useSlashCommand active item scrolling source', (): void => {
  it('marks active item scrolling only for keyboard navigation', (): void => {
    const slashCommand = createSlashCommandHook();

    slashCommand.slashVisible.value = true;
    slashCommand.handleSlashCommandArrowDown();

    expect(slashCommand.slashActiveIndex.value).toBe(1);
    expect(slashCommand.slashShouldScrollActive.value).toBe(true);

    slashCommand.handleSlashActiveIndexChange(2);

    expect(slashCommand.slashActiveIndex.value).toBe(2);
    expect(slashCommand.slashShouldScrollActive.value).toBe(false);
  });
});
