<!--
  @file ContainerView.vue
  @description 容器节点渲染组件，支持批注、提示、警告等多种容器类型。
-->
<template>
  <node-view-wrapper :class="containerClasses" :data-container-id="id">
    <div v-if="type === 'comment'" class="b-container-comment-card">
      <div class="b-container-comment-header">
        <span class="b-container-comment-icon">&#x1F4AC;</span>
        <span class="b-container-comment-label">批注</span>
        <span v-if="resolved" class="b-container-resolved">已解决</span>
      </div>
      <div v-if="commentText" class="b-container-comment-content">{{ commentText }}</div>
    </div>
    <div
      v-else-if="type !== 'comment' && title"
      class="b-container-title"
    >
      <span :class="['b-container-icon', `b-container-icon-${type}`]">
        {{ getContainerIcon(type) }}
      </span>
      <span class="b-container-title-text">{{ title }}</span>
    </div>
    <div class="b-container-body">
      <node-view-content />
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';
import { computed } from 'vue';

const props = defineProps<NodeViewProps>();

const type = computed(() => props.node.attrs.type as string);
const id = computed(() => props.node.attrs.id as string | undefined);
const title = computed(() => props.node.attrs.title as string | undefined);
const commentText = computed(() => props.node.attrs.commentText as string | undefined);
const resolved = computed(() => props.node.attrs.resolved as boolean | undefined);

const containerClasses = computed(() => [
  'b-container',
  `b-container-${type.value}`
]);

/**
 * 根据容器类型获取图标。
 * @param containerType - 容器类型
 * @returns 图标字符
 */
function getContainerIcon(containerType: string): string {
  const iconMap: Record<string, string> = {
    tip: '\uD83D\uDCA1',
    warning: '\u26A0\uFE0F',
    danger: '\uD83D\uDD25',
    info: '\u2139\uFE0F'
  };
  return iconMap[containerType] || '\uD83D\uDCE6';
}
</script>

<style lang="less" scoped>
.b-container {
  padding: 12px;
  margin: 8px 0;
  border-radius: 4px;
  border-left: 3px solid transparent;
}

.b-container-comment {
  border-left-color: #1890ff;
  background: #f0f7ff;
}

.b-container-tip {
  border-left-color: #52c41a;
  background: #f6ffed;
}

.b-container-warning {
  border-left-color: #faad14;
  background: #fffbe6;
}

.b-container-danger {
  border-left-color: #ff4d4f;
  background: #fff2f0;
}

.b-container-info {
  border-left-color: #722ed1;
  background: #f9f0ff;
}

.b-container-comment-card {
  margin-bottom: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.b-container-comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: #1890ff;
}

.b-container-comment-label {
  font-size: 14px;
}

.b-container-comment-content {
  font-size: 14px;
  color: #595959;
  line-height: 1.6;
}

.b-container-resolved {
  font-size: 12px;
  padding: 2px 6px;
  background: #52c41a;
  color: white;
  border-radius: 2px;
}

.b-container-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.b-container-icon {
  font-size: 16px;
}

.b-container-body {
  // TipTap NodeViewContent 自动渲染子节点
}
</style>
