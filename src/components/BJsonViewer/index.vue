<!--
  @file index.vue
  @description JSON 节点图查看器，基于 Vue Flow 将 JSON 结构渲染为聚合卡片关系图。
-->
<template>
  <div :class="name">
    <div v-if="parseError" :class="bem('empty')">
      <div :class="bem('empty-title')">JSON 解析失败</div>
      <div :class="bem('empty-message')">{{ parseError }}</div>
    </div>

    <div v-else-if="graphNodes.length === 0" :class="bem('empty')">
      <div :class="bem('empty-title')">暂无 JSON 数据</div>
      <div :class="bem('empty-message')">传入 JSON 字符串或对象后会在这里显示节点图</div>
    </div>

    <VueFlow
      v-else
      :nodes="graphNodes"
      :edges="graphEdges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="true"
      :fit-view-on-init="true"
      :min-zoom="0.2"
      :max-zoom="1.8"
      :class="bem('flow')"
    >
      <template #node-json="{ data }">
        <JsonRecordNode :data="data" />
      </template>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import type { BJsonViewerProps } from './types';
import { VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { createNamespace } from '@/utils/namespace';
import JsonRecordNode from './components/JsonRecordNode.vue';
import { useJsonGraph } from './hooks/useJsonGraph';

defineOptions({ name: 'BJsonViewer' });

const props = withDefaults(defineProps<BJsonViewerProps>(), {
  content: '',
  value: undefined
});

const [name, bem] = createNamespace('json-viewer');
const { parseError, graphEdges, graphNodes } = useJsonGraph(props);
</script>

<style lang="less">
.b-json-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 360px;
  overflow: hidden;
  color: var(--json-viewer-value);
  background-color: var(--bg-primary);
}

.b-json-viewer__flow {
  width: 100%;
  height: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: transparent;
}

.b-json-viewer__node {
  position: relative;
  min-width: 124px;
  color: var(--json-viewer-value);
  background: var(--json-viewer-node-bg);
  border: 1px solid var(--json-viewer-node-border);
  border-radius: 5px;
  box-shadow: var(--shadow-lg);
}

.b-json-viewer__node--record {
  width: 430px;
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

.b-json-viewer .vue-flow__edge-textbg {
  fill: transparent;
  stroke: transparent;
}

.b-json-viewer .vue-flow__edge-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 20px;
  fill: var(--json-viewer-edge);
}

.b-json-viewer__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 360px;
  padding: 28px;
  text-align: center;
  background: var(--json-viewer-bg);
}

.b-json-viewer__empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--json-viewer-value);
}

.b-json-viewer__empty-message {
  max-width: 420px;
  margin-top: 8px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-secondary);
}
</style>
