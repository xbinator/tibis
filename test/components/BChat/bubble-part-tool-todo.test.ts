/**
 * @file bubble-part-tool-todo.test.ts
 * @description 验证 todowrite 工具结果以任务列表样式展示完整写入快照。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import type { ChatMessageToolPart } from 'types/chat';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartTool from '@/components/BChat/components/MessageBubble/BubblePartTool/index.vue';
import type { TodoItem } from '@/stores/chat/todo';

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openFile: vi.fn().mockResolvedValue(undefined)
  })
}));

/**
 * 创建成功的 todowrite 工具消息片段。
 * @param todos - 本次工具调用写入的完整任务列表
 * @returns 工具消息片段
 */
function createTodoPart(todos: TodoItem[]): ChatMessageToolPart {
  return {
    id: 'tool-part-todo',
    type: 'tool',
    toolCallId: 'tool-call-todo',
    toolName: 'todowrite',
    status: 'done',
    input: { todos },
    result: {
      toolName: 'todowrite',
      status: 'success',
      data: {
        count: todos.length,
        stats: {
          pending: todos.filter((todo) => todo.status === 'pending').length,
          in_progress: todos.filter((todo) => todo.status === 'in_progress').length,
          completed: todos.filter((todo) => todo.status === 'completed').length,
          cancelled: todos.filter((todo) => todo.status === 'cancelled').length
        }
      }
    }
  };
}

/**
 * 挂载并展开工具气泡。
 * @param part - 工具消息片段
 * @returns 展开后的组件包装器
 */
async function mountExpanded(part: ChatMessageToolPart): Promise<VueWrapper> {
  const wrapper = mount(BubblePartTool, {
    props: { part },
    global: {
      stubs: {
        BIcon: {
          props: ['icon'],
          template: '<i :data-icon="icon"></i>'
        },
        BTruncateText: {
          props: ['text'],
          template: '<span>{{ text }}</span>'
        }
      }
    }
  });

  await wrapper.find('.message-bubble-part__title').trigger('click');
  return wrapper;
}

describe('BubblePartTool todowrite result', (): void => {
  it('shows the full task snapshot with TodoPanel status and priority styling', async (): Promise<void> => {
    const wrapper = await mountExpanded(
      createTodoPart([
        { content: '分析现有实现', status: 'completed', priority: 'high' },
        { content: '更新任务列表样式', status: 'in_progress', priority: 'medium' },
        { content: '执行回归检查', status: 'pending', priority: 'low' }
      ])
    );

    expect(wrapper.find('.todo-list__progress').text()).toBe('1/3');
    expect(wrapper.findAll('.todo-list__item')).toHaveLength(3);
    expect(wrapper.find('.todo-list__item--completed [data-icon="lucide:check-circle-2"]').exists()).toBe(true);
    expect(wrapper.find('.todo-list__item--in_progress [data-icon="lucide:circle-dot"]').exists()).toBe(true);
    expect(wrapper.find('.todo-list__priority--low').exists()).toBe(true);
    expect(wrapper.text()).toContain('更新任务列表样式');
    expect(wrapper.text()).not.toContain('已更新 3 项任务');
  });

  it('shows a readable empty state after clearing the task list', async (): Promise<void> => {
    const wrapper = await mountExpanded(createTodoPart([]));

    expect(wrapper.find('.bubble-part-tool__todo-empty').text()).toBe('已清空任务列表');
    expect(wrapper.find('.todo-list').exists()).toBe(false);
  });
});
