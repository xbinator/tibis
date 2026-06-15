<!--
  @file index.vue
  @description 交互容器主组件，管理 Toast 的显示
-->
<template>
  <template v-if="toastQueue.length">
    <ToastItem
      v-for="toast in toastQueue"
      :id="toast.id"
      :key="toast.id"
      :type="toast.type"
      :content="toast.content"
      :duration="toast.duration"
      :shake="toast.shake"
      @close="removeToast"
    />
  </template>
</template>

<script setup lang="ts">
import type { ToastItem as ToastItemType } from './types';
import ToastItem from './ToastItem.vue';

/**
 * InteractionContainer 属性
 */
interface Props {
  /** Toast 队列 */
  toastQueue: ToastItemType[];
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'removeToast', id: string): void;
}>();

/**
 * 移除 Toast
 * @param id - Toast ID
 */
function removeToast(id: string): void {
  emit('removeToast', id);
}
</script>

<style scoped lang="less"></style>
