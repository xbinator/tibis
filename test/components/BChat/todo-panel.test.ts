/**
 * @file todo-panel.test.ts
 * @description TodoPanel 展开折叠与当前任务摘要测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TodoPanel from '@/components/BChat/components/TodoPanel.vue';
import type { TodoItem } from '@/stores/chat/todo';

/** BButton 测试替身。 */
const BButtonStub = defineComponent({
  name: 'BButton',
  emits: ['click'],
  template: '<button type="button" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>'
});

/** BIcon 测试替身。 */
const BIconStub = defineComponent({
  name: 'BIcon',
  props: {
    icon: {
      type: String,
      required: true
    }
  },
  template: '<i :data-icon="icon"></i>'
});

/**
 * 挂载 TodoPanel。
 * @param todos - 待办任务列表
 * @param visible - 面板展开状态
 * @returns 组件包装器
 */
function mountTodoPanel(todos: TodoItem[], visible: boolean): ReturnType<typeof mount> {
  return mount(TodoPanel, {
    props: {
      todos,
      visible
    },
    global: {
      stubs: {
        BButton: BButtonStub,
        BIcon: BIconStub
      }
    }
  });
}

describe('TodoPanel', (): void => {
  it('keeps task list title without showing finished countdown when folded', (): void => {
    const wrapper = mountTodoPanel(
      [
        { content: '完成 A', status: 'completed', priority: 'high' },
        { content: '取消 B', status: 'cancelled', priority: 'low' }
      ],
      false
    );

    expect(wrapper.text()).toContain('任务列表 1/2');
    expect(wrapper.text()).not.toContain('秒后关闭');
    expect(wrapper.find('.todo-panel__finished-summary').exists()).toBe(false);
  });

  it('shows the current in-progress task while folded', (): void => {
    const wrapper = mountTodoPanel(
      [
        { content: '等待任务', status: 'pending', priority: 'low' },
        { content: '执行任务', status: 'in_progress', priority: 'high' }
      ],
      false
    );

    expect(wrapper.find('.todo-panel__current-task-text').text()).toBe('执行任务');
  });

  it('emits visible update when the toggle is clicked', async (): Promise<void> => {
    const wrapper = mountTodoPanel([{ content: '执行任务', status: 'in_progress', priority: 'high' }], false);

    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('update:visible')).toEqual([[true]]);
  });
});
