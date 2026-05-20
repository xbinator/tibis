<!--
  @file ContainerView.vue
  @description 容器节点渲染组件，支持批注、提示、警告等多种容器类型。
-->
<template>
  <NodeViewWrapper :class="containerClasses" :data-container-id="attrs.id">
    <!-- 批注卡片 -->
    <template v-if="isComment">
      <div :class="bem('comment-header')">
        <span :class="bem('comment-icon')">{{ config.icon }}</span>
        <span :class="bem('comment-label')">{{ config.label }}</span>
        <span v-if="attrs.resolved" :class="bem('resolved')">已解决</span>
      </div>
      <div v-if="attrs.commentText" :class="bem('comment-content')">
        {{ attrs.commentText }}
      </div>
    </template>

    <!-- 普通容器标题 -->
    <div v-else-if="attrs.title" :class="bem('title')">
      <span :class="bem('icon')">{{ config.icon }}</span>
      <span :class="bem('title-text')">{{ attrs.title }}</span>
    </div>

    <div :class="bem('body')">
      <NodeViewContent />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3';
import { computed } from 'vue';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';
import { createNamespace } from '@/utils/namespace';

const [, bem] = createNamespace('', 'b-markdown-container');

// ---- 节点属性类型 ----
interface ContainerAttrs {
  type: string;
  id?: string;
  title?: string;
  commentText?: string;
  resolved?: boolean;
}

// ---- 配置表 ----
const CONTAINER_CONFIG: Record<string, { icon: string; label: string }> = {
  comment: { icon: '💬', label: '批注' },
  tip: { icon: '💡', label: '提示' },
  warning: { icon: '⚠️', label: '警告' },
  danger: { icon: '🔥', label: '危险' },
  info: { icon: 'ℹ️', label: '说明' }
};
const DEFAULT_CONFIG = { icon: '📦', label: '' };

// ---- Props ----
const props = defineProps<NodeViewProps>();

// 统一收敛类型断言，各字段 computed 只做轻量转发
const attrs = computed(() => props.node.attrs as ContainerAttrs);

const type = computed(() => attrs.value.type);
const isComment = computed(() => type.value === 'comment');
const config = computed(() => CONTAINER_CONFIG[type.value] ?? DEFAULT_CONFIG);

const containerClasses = computed(() => [bem(), bem(type.value)]);
</script>

<style lang="less" scoped>
// ---- 基础变量 ----
.b-markdown-container {
  --container-bg: transparent;
  --container-border: #d9d9d9;

  padding: 12px 16px;
  margin: 8px 0;
  background: var(--container-bg);
  border-left: 3px solid var(--container-border);
  border-radius: 4px;
}

// ---- 类型主题（只覆盖变量）----
.b-markdown-container--comment {
  --container-bg: #f0f7ff;
  --container-border: #1890ff;
}

.b-markdown-container--tip {
  --container-bg: #f6ffed;
  --container-border: #52c41a;
}

.b-markdown-container--warning {
  --container-bg: #fffbe6;
  --container-border: #faad14;
}

.b-markdown-container--danger {
  --container-bg: #fff2f0;
  --container-border: #ff4d4f;
}

.b-markdown-container--info {
  --container-bg: #f9f0ff;
  --container-border: #722ed1;
}

// ---- 批注头部 ----
.b-markdown-container__comment-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: #1890ff;
}

.b-markdown-container__comment-icon {
  font-size: 16px;
  line-height: 1;
}

.b-markdown-container__comment-label {
  font-size: 14px;
}

.b-markdown-container__comment-content {
  font-size: 14px;
  line-height: 1.6;
  color: #595959;
}

.b-markdown-container__resolved {
  padding: 2px 6px;
  font-size: 12px;
  color: white;
  background: #52c41a;
  border-radius: 2px;
}

// ---- 普通容器标题 ----
.b-markdown-container__title {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.b-markdown-container__icon {
  font-size: 16px;
  line-height: 1;
}

// ---- 正文 ----
.b-markdown-container__body {
  font-size: 14px;
  line-height: 1.7;
}
</style>
