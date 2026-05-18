<!--
  @file JsonRecordNode.vue
  @description BJsonViewer 的 Vue Flow 自定义节点卡片。
-->
<template>
  <div :class="bem('node', [data.variant, data.kind])">
    <Handle type="target" :position="Position.Left" :class="bem('handle', ['target'])" />

    <div v-if="data.variant === 'value'" :class="bem('value')">
      {{ data.valueText }}
    </div>

    <div v-else :class="bem('rows')">
      <div v-for="row in data.rows" :key="row.id" :class="bem('row')">
        <span :class="bem('key')">{{ row.key }}:</span>
        <span :class="bem('row-value', [row.kind])">{{ row.value }}</span>
        <Handle v-if="row.hasLink" :id="row.handleId" type="source" :position="Position.Right" :class="bem('handle', ['source'])" />
      </div>
    </div>
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
