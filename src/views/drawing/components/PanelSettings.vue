<!--
  @file PanelSettings.vue
  @description 画图页面右侧属性设置调度面板。
-->
<template>
  <aside class="setter-panel">
    <PageSetter v-if="select && !isElementTarget(select)" :drawing-data="drawingData" :metadata="select" />
    <div v-else-if="select === null" class="setter-panel__empty">已选择多个元素</div>
    <template v-else>
      <ATabs>
        <ATabPane key="design" tab="设计">
          <DesignSetter v-model:element="select" />
        </ATabPane>

        <ATabPane key="style" tab="属性">1</ATabPane>
      </ATabs>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { Tabs as ATabs, TabPane as ATabPane } from 'ant-design-vue';
import type { DrawingData, DrawingElement, DrawingSelectTarget } from '@/components/BDrawing/types';
import DesignSetter from './DesignSetter.vue';
import PageSetter from './PageSetter.vue';

/**
 * 画图设置栏入参。
 */
interface Props {
  /** 当前画图数据 */
  drawingData: DrawingData;
}

defineProps<Props>();

const select = defineModel<DrawingSelectTarget>('select', { default: null });

/**
 * 判断当前设置目标是否为画图元素。
 * @param target - 当前设置目标
 * @returns 是否为画图元素
 */
function isElementTarget(target: DrawingSelectTarget): target is DrawingElement {
  return typeof target === 'object' && target !== null && 'id' in target && typeof target.id === 'string';
}
</script>

<style lang="less" scoped>
.setter-panel {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: 300px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-size: 12px;
  background: var(--bg-primary);
  box-shadow: inset 1px 0 0 var(--border-primary);
}

:deep(.ant-tabs) {
  height: 100%;

  .ant-tabs-nav {
    padding: 0 12px;
    margin-bottom: 0;
    box-shadow: 0 1px 0 0 var(--border-primary);
  }

  .ant-tabs-tab {
    height: 38px;
    padding: 0;
  }

  .ant-tabs-content-holder {
    overflow: auto;
  }
}

.setter-panel__empty {
  padding: 16px 12px;
  color: var(--text-secondary);
}
</style>
