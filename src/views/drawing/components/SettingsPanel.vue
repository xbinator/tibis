<!--
  @file SettingsPanel.vue
  @description 画图页面右侧属性设置调度面板。
-->
<template>
  <aside class="setter-panel">
    <PageSetter v-if="!selectedElements.length" :drawing-data="drawingData" />
    <template v-else>
      <ATabs>
        <ATabPane key="design" tab="设计">
          <DesignSetter :selected-elements="selectedElements" />
        </ATabPane>
        <ATabPane key="style" tab="属性">1</ATabPane>
      </ATabs>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Tabs as ATabs, TabPane as ATabPane } from 'ant-design-vue';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
import DesignSetter from './DesignSetter.vue';
import PageSetter from './PageSetter.vue';

/**
 * 画图设置栏入参。
 */
interface Props {
  /** 当前画图数据 */
  drawingData: DrawingData;
  /** 当前选中的画图元素 */
  selectedElements?: DrawingElement[];
}

const props = withDefaults(defineProps<Props>(), {
  selectedElements: (): DrawingElement[] => []
});
/** 当前选中元素列表。 */
const selectedElements = computed<DrawingElement[]>(() => props.selectedElements);
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
  .ant-tabs-nav {
    padding: 0 12px;
    margin-bottom: 0;
    box-shadow: 0 1px 0 0 var(--border-primary);
  }

  .ant-tabs-tab {
    height: 38px;
    padding: 0;
  }
}
</style>
