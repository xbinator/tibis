<!--
  @file TodoList.vue
  @description 可复用的待办任务列表，统一展示任务状态与空列表提示。
-->
<template>
  <div class="todo-list__body">
    <div v-if="todos.length === 0" class="todo-list__empty">已清空任务列表</div>
    <div v-for="(todo, index) in todos" :key="index" class="todo-list__item" :class="'todo-list__item--' + todo.status">
      <span class="todo-list__status-icon">
        <BIcon v-if="todo.status === 'completed'" icon="lucide:check-circle-2" :size="14" />
        <BIcon v-else-if="todo.status === 'in_progress'" icon="lucide:circle-dot" :size="14" />
        <BIcon v-else-if="todo.status === 'cancelled'" icon="lucide:x-circle" :size="14" />
        <BIcon v-else icon="lucide:circle" :size="14" />
      </span>
      <span class="todo-list__content">{{ todo.content }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file TodoList.vue
 * @description 可复用的待办任务列表，统一展示任务状态与空列表提示。
 */
import type { TodoItem } from '@/stores/chat/todo';

defineOptions({ name: 'TodoList' });

/**
 * TodoList 属性。
 */
interface TodoListProps {
  /** 要展示的任务列表。 */
  todos: TodoItem[];
}

defineProps<TodoListProps>();
</script>

<style scoped lang="less">
.todo-list__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.todo-list__item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  line-height: 1.5;
}

.todo-list__item--completed {
  text-decoration: line-through;
  opacity: 0.5;
}

.todo-list__item--cancelled {
  text-decoration: line-through;
  opacity: 0.4;
}

.todo-list__status-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  padding-top: 2px;
}

.todo-list__item--pending .todo-list__status-icon {
  color: var(--text-tertiary);
}

.todo-list__item--in_progress .todo-list__status-icon {
  color: var(--color-primary);
}

.todo-list__item--completed .todo-list__status-icon {
  color: var(--color-success);
}

.todo-list__item--cancelled .todo-list__status-icon {
  color: var(--text-tertiary);
}

.todo-list__content {
  font-size: 12px;
  color: var(--text-primary);
}

.todo-list__empty {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
