/**
 * @file slash-command-select-scroll.test.ts
 * @description 验证斜杠命令菜单将活动项滚动配置传递给通用下拉组件。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SelectDropdown from '@/components/BText/components/_SelectDropdown.vue';
import SlashCommandSelect from '@/components/BText/components/SlashCommandSelect.vue';
import type { SlashCommandId, SlashCommandOption } from '@/components/BText/types';

/**
 * 通用下拉滚动配置属性。
 */
interface SelectDropdownScrollProps {
  /** 活动项变化时是否滚动到可视区 */
  scrollActiveIntoView?: boolean;
}

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

describe('SlashCommandSelect active item scrolling', (): void => {
  it('passes keyboard scroll request to SelectDropdown', (): void => {
    const wrapper = mount(SlashCommandSelect, {
      props: {
        visible: true,
        commands: [createSlashCommand('model'), createSlashCommand('compact')],
        activeIndex: 1,
        scrollActiveIntoView: true
      }
    });

    const dropdownProps = wrapper.findComponent(SelectDropdown).props() as unknown as SelectDropdownScrollProps;

    expect(dropdownProps.scrollActiveIntoView).toBe(true);
  });
});
