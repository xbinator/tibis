<!--
  @file PanelSettings.vue
  @description Widget页面右侧属性设置调度面板。
-->
<template>
  <aside class="setter-panel">
    <PageSetter v-if="select && !isElementTarget(select)" v-model:value="dataItem" @edit-code="emit('edit-code')" />
    <ATabs v-else-if="select === null && selectedElementIds.length > 1">
      <ATabPane key="design" tab="设计">
        <BatchSetter
          :data-item="dataItem"
          :selected-element-ids="selectedElementIds"
          @command="emit('multi-command', $event)"
          @layout-change="emit('multi-layout-change', $event)"
          @style-change="emit('multi-style-change', $event)"
        />
      </ATabPane>

      <ATabPane v-if="sameGroupSelectedElements.length > 1" key="advanced" tab="高级">
        <AdvancedSetter :data-item="dataItem" :target-elements="sameGroupSelectedElements" @loop-change="emitLoopChange" />
      </ATabPane>
    </ATabs>
    <div v-else-if="select === null" class="setter-panel__empty">已选择多个元素</div>
    <template v-else>
      <ATabs>
        <ATabPane key="design" tab="设计">
          <DesignSetter v-model:element="select" />
        </ATabPane>

        <ATabPane key="style" tab="属性">
          <component :is="elementSetter" v-if="elementSetter" v-model:element="select" :data-item="dataItem" />
          <div v-else class="setter-panel__empty">暂无专属属性</div>
        </ATabPane>

        <ATabPane key="advanced" tab="高级">
          <AdvancedSetter :data-item="dataItem" :target-elements="[select]" @loop-change="emitLoopChange" />
        </ATabPane>
      </ATabs>
    </template>
  </aside>
</template>

<script setup lang="ts">
import type { WidgetLoopChangePayload, WidgetMultiSelectLayoutChange } from '../types';
import type { Component } from 'vue';
import { computed } from 'vue';
import { Tabs as ATabs, TabPane as ATabPane } from 'ant-design-vue';
import { getWidgetElementSetter } from '@/components/BWidget/elements';
import type { WidgetData, WidgetElement, WidgetElementStyleChange, WidgetSelectTarget } from '@/components/BWidget/types';
import { getWidgetElementGroupId } from '@/components/BWidget/utils/widgetGroups';
import AdvancedSetter from './AdvancedSetter.vue';
import BatchSetter from './BatchSetter.vue';
import DesignSetter from './DesignSetter.vue';
import PageSetter from './PageSetter.vue';

/**
 * Widget设置栏入参。
 */
interface Props {
  /** 当前选中的元素 ID 列表 */
  selectedElementIds?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  selectedElementIds: (): string[] => []
});
const emit = defineEmits<{
  /** 打开运行代码编辑器 */
  'edit-code': [];
  /** 触发多选快捷操作 */
  'multi-command': [command: 'copy' | 'group' | 'ungroup' | 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack' | 'delete'];
  /** 批量更新多选元素布局 */
  'multi-layout-change': [layout: WidgetMultiSelectLayoutChange];
  /** 批量更新多选元素样式 */
  'multi-style-change': [style: WidgetElementStyleChange];
  /** 更新元素循环配置 */
  'loop-change': [payload: WidgetLoopChangePayload];
}>();

const dataItem = defineModel<WidgetData>('value', { required: true });
const select = defineModel<WidgetSelectTarget>('select', { default: null });

/**
 * 判断当前设置目标是否为Widget元素。
 * @param target - 当前设置目标
 * @returns 是否为Widget元素
 */
function isElementTarget(target: WidgetSelectTarget): target is WidgetElement {
  return typeof target === 'object' && target !== null && 'id' in target && typeof target.id === 'string';
}

/**
 * 透传循环配置变更。
 * @param payload - 循环配置变更
 */
function emitLoopChange(payload: WidgetLoopChangePayload): void {
  emit('loop-change', payload);
}

/** 当前选中元素对应的专属属性设置面板。 */
const elementSetter = computed<Component | null>(() => (isElementTarget(select.value) ? getWidgetElementSetter(select.value.name) : null));

/** 当前多选命中的元素，保持Widget数组顺序。 */
const selectedElements = computed<WidgetElement[]>(() => {
  const selectedIds = new Set(props.selectedElementIds);

  return dataItem.value.elements.filter((element: WidgetElement): boolean => selectedIds.has(element.id));
});

/** 同一个组合内的多选元素，用于开启组合循环。 */
const sameGroupSelectedElements = computed<WidgetElement[]>(() => {
  if (selectedElements.value.length <= 1 || selectedElements.value.length !== props.selectedElementIds.length) {
    return [];
  }

  const firstGroupId = getWidgetElementGroupId(selectedElements.value[0]);
  if (!firstGroupId) {
    return [];
  }

  return selectedElements.value.every((element: WidgetElement): boolean => getWidgetElementGroupId(element) === firstGroupId) ? selectedElements.value : [];
});
</script>

<style lang="less" scoped>
.setter-panel {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: 100%;
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
    height: 40px;
    padding: 0;
  }

  .ant-tabs-content {
    padding: 12px;
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
