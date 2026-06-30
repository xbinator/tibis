<!--
  @file BubblePartWidget.vue
  @description 聊天消息中小组件快照片段的运行态展示组件。
-->
<template>
  <div :class="name">
    <BWidgetRuntime :data-item="part.dataItem" :render-context="part.renderContext" />
  </div>
</template>

<script setup lang="ts">
import type { ChatMessageWidgetPart } from 'types/chat';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BubblePartWidget' });

interface Props {
  /** 小组件消息片段 */
  part: ChatMessageWidgetPart;
}

defineProps<Props>();

const [name] = createNamespace('', 'message-bubble-widget');
</script>

<style scoped lang="less">
.message-bubble-widget {
  min-width: 220px;
  overflow: hidden;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}
</style>
