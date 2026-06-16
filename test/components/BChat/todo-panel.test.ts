/**
 * @file todo-panel.test.ts
 * @description TodoPanel 折叠摘要与关闭行为测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TodoPanel from '@/components/BChat/components/TodoPanel.vue';
import type { TodoItem } from '@/stores/chat/todo';

const todoStoreMock = vi.hoisted(() => ({
  clearTodos: vi.fn<(sessionId: string) => void>()
}));

vi.mock('@/stores/chat/todo', () => ({
  useTodoStore: vi.fn(() => todoStoreMock)
}));

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
 * @param sessionId - 当前会话 ID
 * @returns 组件包装器
 */
function mountTodoPanel(todos: TodoItem[], visible: boolean, sessionId: string | null = 'session-1'): ReturnType<typeof mount> {
  return mount(TodoPanel, {
    props: {
      todos,
      sessionId,
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
  beforeEach((): void => {
    todoStoreMock.clearTodos.mockReset();
  });

  it('keeps task list title and shows finished summary when folded', (): void => {
    const wrapper = mountTodoPanel(
      [
        { content: '完成 A', status: 'completed', priority: 'high' },
        { content: '取消 B', status: 'cancelled', priority: 'low' }
      ],
      false
    );

    expect(wrapper.text()).toContain('任务列表 1/2');
    expect(wrapper.text()).toContain('已完成');
    expect(wrapper.find('.todo-panel__close-completed').exists()).toBe(true);
  });

  it('clears current session todos when close button is clicked in finished summary', async (): Promise<void> => {
    const wrapper = mountTodoPanel([{ content: '完成 A', status: 'completed', priority: 'high' }], false);

    await wrapper.find('.todo-panel__close-completed').trigger('click');

    expect(todoStoreMock.clearTodos).toHaveBeenCalledWith('session-1');
  });

  it('does not clear todos when session id is missing', async (): Promise<void> => {
    const wrapper = mountTodoPanel([{ content: '完成 A', status: 'completed', priority: 'high' }], false, null);

    await wrapper.find('.todo-panel__close-completed').trigger('click');

    expect(todoStoreMock.clearTodos).not.toHaveBeenCalled();
  });

  it('does not show close button in expanded finished panel header', (): void => {
    const wrapper = mountTodoPanel([{ content: '完成 A', status: 'completed', priority: 'high' }], true);

    expect(wrapper.find('.todo-panel__close').exists()).toBe(false);
  });
});
