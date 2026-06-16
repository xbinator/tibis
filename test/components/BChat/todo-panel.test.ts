/**
 * @file todo-panel.test.ts
 * @description TodoPanel 折叠摘要与关闭行为测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.useFakeTimers();
    todoStoreMock.clearTodos.mockReset();
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('keeps task list title and only shows finished countdown when folded', (): void => {
    const wrapper = mountTodoPanel(
      [
        { content: '完成 A', status: 'completed', priority: 'high' },
        { content: '取消 B', status: 'cancelled', priority: 'low' }
      ],
      false
    );

    expect(wrapper.text()).toContain('任务列表 1/2');
    expect(wrapper.find('.todo-panel__finished-summary-icon').exists()).toBe(false);
    expect(wrapper.find('.todo-panel__finished-summary-text').exists()).toBe(false);
    expect(wrapper.text()).toContain('3秒后关闭');
    expect(wrapper.find('.todo-panel__close-completed').exists()).toBe(false);
  });

  it('requests panel dismissal after folded finished countdown ends', async (): Promise<void> => {
    const wrapper = mountTodoPanel([{ content: '完成 A', status: 'completed', priority: 'high' }], false);

    await vi.advanceTimersByTimeAsync(3000);

    expect(wrapper.emitted('dismiss')).toEqual([[]]);
    expect(todoStoreMock.clearTodos).not.toHaveBeenCalled();
  });

  it('cancels finished countdown while the user opens the board', async (): Promise<void> => {
    const wrapper = mountTodoPanel([{ content: '完成 A', status: 'completed', priority: 'high' }], false);

    await vi.advanceTimersByTimeAsync(1000);
    await wrapper.setProps({ visible: true });
    await vi.advanceTimersByTimeAsync(4000);

    expect(wrapper.emitted('dismiss')).toBeUndefined();
  });

  it('restarts finished countdown when the user folds the finished board', async (): Promise<void> => {
    const wrapper = mountTodoPanel([{ content: '完成 A', status: 'completed', priority: 'high' }], true);

    await wrapper.setProps({ visible: false });
    expect(wrapper.text()).toContain('3秒后关闭');

    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.text()).toContain('2秒后关闭');

    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.emitted('dismiss')).toEqual([[]]);
  });
});
