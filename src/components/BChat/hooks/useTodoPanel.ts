/**
 * @file useTodoPanel.ts
 * @description 聊天会话 Todo 面板状态管理 hook。
 */
import type { Message } from '../utils/types';
import type { ComputedRef, Ref } from 'vue';
import { computed, ref, watch } from 'vue';
import { uniq } from 'lodash-es';
import type { TodoItem } from '@/stores/chat/todo';
import { useTodoStore } from '@/stores/chat/todo';

/**
 * Todo 面板 hook 配置。
 */
interface UseTodoPanelOptions {
  /** 当前聊天运行时使用的有效会话 ID。 */
  activeSessionId: ComputedRef<string | null>;
}

/**
 * Todo 面板 hook 返回值。
 */
interface UseTodoPanelReturn {
  /** 当前会话的待办列表。 */
  currentSessionTodos: ComputedRef<TodoItem[]>;
  /** Todo 面板可见性。 */
  todoPanelVisible: Ref<boolean>;
  /** Todo 面板是否已因当前任务全部结束而隐藏。 */
  todoPanelDismissed: Ref<boolean>;
  /** 按回退消息区间恢复对应的 Todo 快照。 */
  restoreTodoSnapshotsForMessages: (sessionId: string | null, rolledBackMessages: Message[]) => void;
}

/**
 * 判断任务列表是否已经全部结束。
 * @param todos - 当前会话的任务列表
 * @returns 所有任务均完成或取消时返回 true
 */
function areTodosFinished(todos: TodoItem[]): boolean {
  return todos.length > 0 && todos.every((todo) => todo.status === 'completed' || todo.status === 'cancelled');
}

/**
 * 管理聊天会话 Todo 面板的自动展示、隐藏和回退恢复。
 * @param options - Todo 面板 hook 配置
 * @returns Todo 面板状态和操作
 */
export function useTodoPanel(options: UseTodoPanelOptions): UseTodoPanelReturn {
  const todoStore = useTodoStore();
  const todoPanelVisible = ref(false);
  const todoPanelDismissed = ref(false);
  const currentSessionTodos = computed(() => todoStore.getTodos(options.activeSessionId.value ?? ''));

  /**
   * 清理已结束任务并隐藏任务面板。
   * @param sessionId - 当前会话 ID
   */
  function clearFinishedTodos(sessionId: string): void {
    todoStore.clearTodos(sessionId);
    todoPanelVisible.value = false;
    todoPanelDismissed.value = true;
  }

  /**
   * 按回退消息区间恢复对应的 Todo 快照。
   * @param sessionId - 当前会话 ID
   * @param rolledBackMessages - 被回退删除的消息列表
   */
  function restoreTodoSnapshotsForMessages(sessionId: string | null, rolledBackMessages: Message[]): void {
    if (!sessionId) return;

    const runtimeIds = uniq(rolledBackMessages.map((message) => message.runtimeId).filter((runtimeId): runtimeId is string => typeof runtimeId === 'string'));
    if (runtimeIds.length === 0) return;

    todoStore.restoreBeforeRuntimeIds(sessionId, runtimeIds);
  }

  /**
   * 监听会话与待办变化，控制面板的隐藏与收起态。
   *
   * 面板默认保持收起（仅显示底部摘要条），由用户手动点击展开；
   * LLM 写入/更新待办时不再自动展开。仅保留以下自动行为：
   * - 待办清空：隐藏面板
   * - 待办全部完成/取消：清理并隐藏面板
   * - 其余情况：确保面板未被 dismissed，以便摘要条可见
   */
  watch(
    () => [options.activeSessionId.value, todoStore.getTodos(options.activeSessionId.value ?? '')] as const,
    ([sessionId, newTodos]) => {
      if (newTodos.length === 0) {
        todoPanelVisible.value = false;
        todoPanelDismissed.value = false;
      } else if (areTodosFinished(newTodos)) {
        if (sessionId) {
          clearFinishedTodos(sessionId);
        }
      } else {
        todoPanelDismissed.value = false;
      }
    },
    { deep: true, immediate: true }
  );

  return {
    currentSessionTodos,
    todoPanelVisible,
    todoPanelDismissed,
    restoreTodoSnapshotsForMessages
  };
}
