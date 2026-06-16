<!--
  @file TodoPanel.vue
  @description 聊天侧边栏的待办任务面板，显示当前会话的 LLM 任务列表。
-->
<template>
  <div v-if="todos.length" class="todo-panel">
    <section v-if="visible && todos.length" class="todo-panel__board">
      <div class="todo-panel__header">
        <span class="todo-panel__title">任务列表</span>
        <span class="todo-panel__progress">{{ completedCount }}/{{ todos.length }}</span>
      </div>

      <div class="todo-panel__body">
        <div v-for="(todo, index) in todos" :key="index" class="todo-panel__item" :class="'todo-panel__item--' + todo.status">
          <span class="todo-panel__status-icon">
            <BIcon v-if="todo.status === 'completed'" icon="lucide:check-circle-2" :size="14" />
            <BIcon v-else-if="todo.status === 'in_progress'" icon="lucide:circle-dot" :size="14" />
            <BIcon v-else-if="todo.status === 'cancelled'" icon="lucide:x-circle" :size="14" />
            <BIcon v-else icon="lucide:circle" :size="14" />
          </span>
          <span class="todo-panel__priority" :class="'todo-panel__priority--' + todo.priority"></span>
          <span class="todo-panel__content">{{ todo.content }}</span>
        </div>
      </div>
    </section>

    <div class="todo-panel__footer">
      <BButton type="text" size="small" class="todo-panel__toggle" @click="emit('update:visible', !visible)">
        <BIcon icon="lucide:list-checks" :size="14" class="todo-panel__toggle-icon" />
        <span>任务列表 {{ completedCount }}/{{ todos.length }}</span>
        <BIcon icon="lucide:chevron-down" :size="12" color="var(--text-tertiary)" :rotate="visible ? 180 : 0" />
      </BButton>
      <span v-if="!visible && currentTask" class="todo-panel__current-task">
        <BIcon icon="lucide:circle-dot" :size="12" class="todo-panel__current-task-icon" />
        <span class="todo-panel__current-task-text">{{ currentTask.content }}</span>
      </span>
      <span v-else-if="!visible && isFinished" class="todo-panel__finished-summary">
        <span class="todo-panel__finished-countdown">{{ finishedDismissRemaining }}秒后关闭</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file TodoPanel.vue
 * @description 聊天侧边栏的待办任务面板，显示当前会话的 LLM 任务列表。
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import type { TodoItem } from '@/stores/chat/todo';

/** 完成态折叠摘要自动隐藏等待秒数。 */
const FINISHED_DISMISS_DELAY_SECONDS = 3;

/**
 * TodoPanel 属性
 */
interface TodoPanelProps {
  /** 当前会话 ID，保留给父级按会话控制面板状态 */
  sessionId: string | null;
  /** 当前会话的任务列表 */
  todos: TodoItem[];
  /** 面板可见性，支持 v-model:visible */
  visible: boolean;
}

defineOptions({ name: 'TodoPanel' });

const props = defineProps<TodoPanelProps>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'dismiss'): void;
}>();

/** 完成态折叠摘要剩余自动隐藏秒数。 */
const finishedDismissRemaining = ref<number>(FINISHED_DISMISS_DELAY_SECONDS);

/** 完成态自动隐藏计时器。 */
let finishedDismissTimer: ReturnType<typeof setInterval> | null = null;

/** 已完成任务数量 */
const completedCount = computed<number>(() => props.todos.filter((t) => t.status === 'completed').length);

/** 当前正在执行的任务（取第一个 in_progress） */
const currentTask = computed<TodoItem | undefined>(() => props.todos.find((t) => t.status === 'in_progress'));

/** 是否所有任务均已结束 */
const isFinished = computed<boolean>(() => props.todos.length > 0 && props.todos.every((t) => t.status === 'completed' || t.status === 'cancelled'));

/**
 * 停止完成态自动隐藏倒计时。
 */
function stopFinishedDismissCountdown(): void {
  if (finishedDismissTimer) {
    clearInterval(finishedDismissTimer);
    finishedDismissTimer = null;
  }
}

/**
 * 启动完成态自动隐藏倒计时。
 */
function startFinishedDismissCountdown(): void {
  stopFinishedDismissCountdown();
  finishedDismissRemaining.value = FINISHED_DISMISS_DELAY_SECONDS;

  finishedDismissTimer = setInterval((): void => {
    if (finishedDismissRemaining.value <= 1) {
      stopFinishedDismissCountdown();
      if (isFinished.value && !props.visible) {
        emit('dismiss');
      }
      return;
    }

    finishedDismissRemaining.value -= 1;
  }, 1000);
}

watch(
  [() => props.visible, isFinished],
  ([visible, finished]): void => {
    if (!visible && finished) {
      startFinishedDismissCountdown();
      return;
    }

    stopFinishedDismissCountdown();
  },
  { immediate: true }
);

onUnmounted((): void => {
  stopFinishedDismissCountdown();
});
</script>

<style scoped lang="less">
.todo-panel {
  position: relative;
  max-width: var(--b-chat-max-width, 800px);
  margin: 0 auto;
}

.todo-panel__board {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  margin-bottom: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
}

.todo-panel__header {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-secondary);
}

.todo-panel__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.todo-panel__progress {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}

.todo-panel__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  padding: 6px 0;
  overflow-y: auto;
}

.todo-panel__item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 4px 12px;
  line-height: 1.5;
}

.todo-panel__item--completed {
  opacity: 0.5;
}

.todo-panel__item--cancelled {
  text-decoration: line-through;
  opacity: 0.4;
}

.todo-panel__status-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  padding-top: 2px;
}

.todo-panel__item--pending .todo-panel__status-icon {
  color: var(--text-tertiary);
}

.todo-panel__item--in_progress .todo-panel__status-icon {
  color: var(--color-primary);
}

.todo-panel__item--completed .todo-panel__status-icon {
  color: var(--color-success);
}

.todo-panel__item--cancelled .todo-panel__status-icon {
  color: var(--text-tertiary);
}

.todo-panel__priority {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
}

.todo-panel__priority--high {
  background: var(--color-error);
}

.todo-panel__priority--medium {
  background: var(--color-warning);
}

.todo-panel__priority--low {
  background: var(--color-success);
}

.todo-panel__content {
  font-size: 12px;
  color: var(--text-primary);
}

.todo-panel__footer {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  padding: 4px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
}

.todo-panel__current-task {
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
}

.todo-panel__finished-summary {
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  margin-left: auto;
  color: var(--text-secondary);
}

.todo-panel__current-task-icon {
  flex-shrink: 0;
  color: var(--color-primary);
}

.todo-panel__toggle-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.todo-panel__current-task-text {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.todo-panel__finished-countdown {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
