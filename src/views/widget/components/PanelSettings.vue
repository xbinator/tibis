<!--
  @file PanelSettings.vue
  @description Widget页面右侧属性设置调度面板。
-->
<template>
  <aside class="setter-panel">
    <PageSetter v-if="select && !isElementTarget(select)" v-model:value="widgetData" @edit-code="emit('edit-code')" />
    <ATabs v-else-if="select === null && selectedElementIds.length > 1">
      <ATabPane key="design" tab="设计">
        <BatchSetter
          @command="emit('multi-command', $event)"
          @layout-change="emit('multi-layout-change', $event)"
          @style-change="emit('multi-style-change', $event)"
        />
      </ATabPane>

      <ATabPane v-if="sameGroupSelectedElements.length > 1" key="advanced" tab="高级">
        <AdvancedSetter v-model:elements="sameGroupSelectedElements" />
      </ATabPane>
    </ATabs>
    <div v-else-if="select === null" class="setter-panel__empty">已选择多个元素</div>
    <template v-else>
      <ATabs>
        <ATabPane key="design" tab="设计">
          <DesignSetter v-model:element="select" />
        </ATabPane>

        <ATabPane key="style" tab="属性">
          <component :is="elementSetter" v-if="elementSetter" v-model:element="select" />
          <div v-else class="setter-panel__empty">暂无专属属性</div>
        </ATabPane>

        <ATabPane key="advanced" tab="高级">
          <AdvancedSetter v-model:elements="selectedTargetElements" />
        </ATabPane>
      </ATabs>
    </template>
  </aside>
</template>

<script setup lang="ts">
import type { WidgetMultiSelectLayoutChange } from '../types';
import type { Component } from 'vue';
import { computed } from 'vue';
import { Tabs as ATabs, TabPane as ATabPane } from 'ant-design-vue';
import { getWidgetElementSetter } from '@/components/BWidget/elements';
import { provideWidgetContext } from '@/components/BWidget/hooks/useWidgetContext';
import type { WidgetData, WidgetElement, WidgetElementStyleChange, WidgetSelectTarget } from '@/components/BWidget/types';
import {
  findWidgetElementTreeNode,
  flattenWidgetElementTree,
  isSameWidgetElementParent,
  updateWidgetElementInTree,
  type WidgetRenderTreeNode
} from '@/components/BWidget/utils/widgetTree';
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
}>();

const widgetData = defineModel<WidgetData>('value', { required: true });
const select = defineModel<WidgetSelectTarget>('select', { default: null });
/** 向下提供的当前 Widget 数据。 */
const providedWidgetData = computed<WidgetData | undefined>((): WidgetData | undefined => widgetData.value);
/** 向下提供的当前选区 ID。 */
const providedSelectedElementIds = computed<string[]>((): string[] => props.selectedElementIds);

provideWidgetContext({
  widgetData: providedWidgetData,
  selectedElementIds: providedSelectedElementIds
});

/**
 * 判断当前设置目标是否为Widget元素。
 * @param target - 当前设置目标
 * @returns 是否为Widget元素
 */
function isElementTarget(target: WidgetSelectTarget): target is WidgetElement {
  return typeof target === 'object' && target !== null && 'id' in target && typeof target.id === 'string';
}

/** 当前选中元素对应的专属属性设置面板。 */
const elementSetter = computed<Component | null>(() => (isElementTarget(select.value) ? getWidgetElementSetter(select.value.name) : null));

/** 当前多选命中的元素，保持Widget数组顺序。 */
const selectedElements = computed<WidgetElement[]>(() => {
  const selectedIds = new Set(props.selectedElementIds);

  return flattenWidgetElementTree(widgetData.value.elements)
    .filter((item: WidgetRenderTreeNode): boolean => selectedIds.has(item.element.id))
    .map((item: WidgetRenderTreeNode): WidgetElement => item.element);
});

/**
 * 将局部编辑元素按 ID 合并回完整元素列表。
 * @param currentElements - 当前完整元素列表
 * @param updatedElements - 局部更新元素列表
 * @returns 合并后的完整元素列表
 */
function mergeElementsById(currentElements: WidgetElement[], updatedElements: WidgetElement[]): WidgetElement[] {
  return updatedElements.reduce<WidgetElement[]>(
    (nextElements: WidgetElement[], element: WidgetElement): WidgetElement[] =>
      updateWidgetElementInTree(nextElements, element.id, (): WidgetElement => element),
    currentElements
  );
}

/**
 * 写回高级设置面板更新后的元素列表。
 * @param updatedElements - 局部更新元素列表
 */
function updateAdvancedElements(updatedElements: WidgetElement[]): void {
  if (updatedElements.length === 0) {
    return;
  }

  const nextElements = mergeElementsById(widgetData.value.elements, updatedElements);

  widgetData.value = { ...widgetData.value, elements: nextElements };

  if (isElementTarget(select.value)) {
    const selectedElementId = select.value.id;
    select.value = findWidgetElementTreeNode(nextElements, selectedElementId)?.element ?? select.value;
  }
}

/** 当前单选元素高级设置模型。 */
const selectedTargetElements = computed<WidgetElement[]>({
  get: (): WidgetElement[] => {
    if (!isElementTarget(select.value)) {
      return [];
    }

    return [findWidgetElementTreeNode(widgetData.value.elements, select.value.id)?.element ?? select.value];
  },
  set: (updatedElements: WidgetElement[]): void => {
    updateAdvancedElements(updatedElements);
  }
});

/** 同一个组合内的多选元素，用于开启组合循环。 */
const sameGroupSelectedElements = computed<WidgetElement[]>({
  get: (): WidgetElement[] => {
    if (selectedElements.value.length <= 1 || selectedElements.value.length !== props.selectedElementIds.length) {
      return [];
    }

    const firstNode = findWidgetElementTreeNode(widgetData.value.elements, props.selectedElementIds[0] ?? '');
    if (!firstNode?.parentId || !isSameWidgetElementParent(widgetData.value.elements, props.selectedElementIds)) {
      return [];
    }

    return selectedElements.value;
  },
  set: (updatedElements: WidgetElement[]): void => {
    updateAdvancedElements(updatedElements);
  }
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
