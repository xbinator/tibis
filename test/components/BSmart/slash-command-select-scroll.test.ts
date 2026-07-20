/**
 * @file slash-command-select-scroll.test.ts
 * @description 验证斜杠命令菜单将活动项滚动配置传递给通用下拉组件。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SelectDropdown from '@/components/BSmart/components/_SelectDropdown.vue';
import SlashCommandSelect from '@/components/BSmart/components/SlashCommandSelect.vue';
import type { SlashCommandOption } from '@/components/BSmart/types';

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
function createSlashCommand(id: string): SlashCommandOption {
  return {
    id,
    trigger: `/${id}`,
    title: id,
    description: `Run ${id}`,
    selectAction: { type: 'emit' }
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

  it('renders a configured group title without changing the flat item count', (): void => {
    const templateCommand: SlashCommandOption = {
      id: 'template',
      trigger: '/template',
      title: 'template',
      description: 'Template item',
      group: 'template',
      groupTitle: '模板',
      selectAction: { type: 'insert', text: '{{template}}' }
    };
    const wrapper = mount(SlashCommandSelect, {
      props: {
        visible: true,
        commands: [createSlashCommand('model'), templateCommand]
      }
    });

    expect(wrapper.findAll('.slash-command-group-title').map((item) => item.text())).toEqual(['模板']);
    expect(wrapper.findAll('.select-dropdown__item')).toHaveLength(2);
    expect(wrapper.find('.slash-command-item-trigger').exists()).toBe(false);
    expect(wrapper.find('.slash-command-item-icon').exists()).toBe(false);
    expect(wrapper.findAll('.slash-command-item-content')[1]?.text()).toBe('templateTemplate item');
  });
});
