<!--
  @file JsonRecordNode.vue
  @description BJsonViewer 的 Vue Flow 自定义节点卡片。
-->
<template>
  <div :class="bem('node', [data.variant, data.kind])" :style="data.variant === 'record' ? { width: `${data.width}px` } : undefined">
    <Handle type="target" :position="Position.Left" :class="bem('handle', ['target'])" />

    <div v-if="data.variant === 'value'" :class="bem('value')">
      {{ data.valueText }}
    </div>

    <div v-else :class="bem('rows')">
      <div v-for="row in data.rows" :key="row.id" :class="bem('row')">
        <span :class="bem('key')">{{ row.key }}:</span>
        <span :class="bem('row-value', [row.kind])">{{ row.value }}</span>
      </div>
    </div>

    <Handle
      v-for="handle in data.handles"
      :id="handle.id"
      :key="handle.id"
      type="source"
      :position="Position.Right"
      :class="bem('handle', ['source'])"
      :style="{ top: `${handle.top}px` }"
    />
  </div>
</template>

<script setup lang="ts">
import type { JsonFlowNodeData } from '../types';
import { Handle, Position } from '@vue-flow/core';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BJsonViewerRecordNode' });

/**
 * 节点组件入参。
 */
interface Props {
  /** Vue Flow 节点数据。 */
  data: JsonFlowNodeData;
}

defineProps<Props>();

const [, bem] = createNamespace('json-viewer');
</script>

<style lang="less">
.b-json-viewer__node {
  position: relative;
  min-width: 124px;
  color: var(--json-viewer-value);
  background: var(--json-viewer-node-bg);
  border: 1px solid var(--json-viewer-node-border);
  border-radius: 5px;
}

.b-json-viewer__node--record {
  min-width: 200px;
}

.b-json-viewer__node--value {
  display: flex;
  align-items: center;
  min-width: 86px;
  min-height: 64px;
  padding: 0 20px;
}

.b-json-viewer__rows {
  overflow: hidden;
  border-radius: 5px;
}

.b-json-viewer__row {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 54px;
  padding: 0 18px;
  font-size: 22px;
  line-height: 1.2;
  border-bottom: 1px solid var(--json-viewer-row-divider);
}

.b-json-viewer__row:last-child {
  border-bottom: 0;
}

.b-json-viewer__key {
  flex: 0 0 auto;
  color: var(--json-viewer-key);
}

.b-json-viewer__row-value,
.b-json-viewer__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--json-viewer-value);
  white-space: nowrap;
}

.b-json-viewer__row-value--number {
  color: var(--json-viewer-number);
}

.b-json-viewer__row-value--boolean {
  color: var(--json-viewer-boolean);
}

.b-json-viewer__row-value--null {
  color: var(--json-viewer-null);
}

.b-json-viewer__row-value--array,
.b-json-viewer__row-value--object {
  color: var(--json-viewer-value);
}

.b-json-viewer__value {
  width: 100%;
  font-size: 22px;
  line-height: 1.2;
  text-align: center;
}

.b-json-viewer__handle {
  width: 1px;
  height: 1px;
  pointer-events: none;
  background: transparent;
  border: 0;
  opacity: 0;
}

.b-json-viewer__handle--source {
  right: -1px;
}

.b-json-viewer__handle--target {
  left: -1px;
}
</style>
