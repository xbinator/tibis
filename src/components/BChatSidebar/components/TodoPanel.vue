<!--
  @file TodoPanel.vue
  @description 聊天侧边栏的待办任务面板，显示当前会话的 LLM 任务列表。
-->
<template>
  <section v-if="todos.length > 0" class="todo-panel">
    <div class="todo-panel__header">
      <span class="todo-panel__title">任务列表</span>
      <span class="todo-panel__progress">{{ completedCount }}/{{ todos.length }}</span>
      <BButton type="text" size="small" class="todo-panel__close" @click="emit('update:visible', false)"> 关闭 </BButton>
    </div>

    <div class="todo-panel__progress-bar">
      <div class="todo-panel__progress-fill" :style="{ width: progressPercent + '%' }"></div>
    </div>

    <div class="todo-panel__body">
      <div v-for="(todo, index) in todos" :key="index" class="todo-panel__item" :class="'todo-panel__item--' + todo.status">
        <span class="todo-panel__status-icon">
          <Icon v-if="todo.status === 'completed'" icon="lucide:check-circle-2" width="14" height="14" />
          <Icon v-else-if="todo.status === 'in_progress'" icon="lucide:circle-dot" width="14" height="14" />
          <Icon v-else-if="todo.status === 'cancelled'" icon="lucide:x-circle" width="14" height="14" />
          <Icon v-else icon="lucide:circle" width="14" height="14" />
        </span>
        <span class="todo-panel__priority" :class="'todo-panel__priority--' + todo.priority"></span>
        <span class="todo-panel__content">{{ todo.content }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * @file TodoPanel.vue
 * @description 聊天侧边栏的待办任务面板，显示当前会话的 LLM 任务列表。
 */
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { TodoItem } from '@/stores/chat/todo';

/**
 * TodoPanel 属性
 */
interface TodoPanelProps {
  /** 当前会话的任务列表 */
  todos: TodoItem[];
  /** 面板可见性，支持 v-model:visible */
  visible: boolean;
}

defineOptions({ name: 'TodoPanel' });

const props = defineProps<TodoPanelProps>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

/** 已完成任务数量 */
const completedCount = computed<number>(() => props.todos.filter((t) => t.status === 'completed').length);

/** 完成进度百分比 */
const progressPercent = computed<number>(() => {
  if (props.todos.length === 0) return 0;
  return (completedCount.value / props.todos.length) * 100;
});
</script>

<style scoped>
.todo-panel {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
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

.todo-panel__close {
  font-size: 12px;
  color: var(--text-tertiary);
}

.todo-panel__close:hover {
  color: var(--text-primary);
}

.todo-panel__progress-bar {
  height: 2px;
  background: var(--bg-disabled);
}

.todo-panel__progress-fill {
  height: 100%;
  background: var(--color-success);
  transition: width 0.3s ease;
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
</style>
