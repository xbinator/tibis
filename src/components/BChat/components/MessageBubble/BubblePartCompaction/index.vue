<!--
  @file BubblePartCompaction.vue
  @description 聊天消息中的上下文压缩生命周期状态行。
-->
<template>
  <div :class="[name, bem({ [part.status]: true })]" role="status" aria-live="polite">
    <BIcon :class="bem('icon', { spin: part.status === 'pending' })" :icon="state.icon" :size="14" />
    <span :class="bem('label')">{{ state.label }}</span>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessageCompactionPart } from 'types/chat';
import { computed } from 'vue';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BubblePartCompaction' });

/** 上下文压缩状态组件属性。 */
interface Props {
  /** 仅用于读取公开生命周期状态的压缩片段。 */
  part: ChatMessageCompactionPart;
}

/** 用户可见的状态展示配置。 */
interface CompactionStateView {
  /** 中性状态图标。 */
  icon: string;
  /** 唯一可见文案。 */
  label: string;
}

const props = defineProps<Props>();
const [name, bem] = createNamespace('bubble-part-compaction');

/** 生命周期状态对应的公开展示，不读取摘要和诊断字段。 */
const STATE_VIEW_MAP: Record<ChatMessageCompactionPart['status'], CompactionStateView> = {
  pending: { icon: 'lucide:loader-circle', label: '上下文压缩中…' },
  success: { icon: 'lucide:check-circle-2', label: '上下文已压缩' },
  failed: { icon: 'lucide:circle-alert', label: '上下文压缩失败' },
  cancelled: { icon: 'lucide:circle-x', label: '上下文压缩已取消' },
  skipped: { icon: 'lucide:minus-circle', label: '当前上下文无需压缩' }
};

/** 当前压缩状态的用户可见配置。 */
const state = computed<CompactionStateView>((): CompactionStateView => STATE_VIEW_MAP[props.part.status]);
</script>

<style scoped lang="less">
@import url('./index.less');
</style>
