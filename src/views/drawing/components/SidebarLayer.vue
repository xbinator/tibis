<!--
  @file SidebarLayer.vue
  @description 画图页面侧边栏图层列表，展示画图元素图层项及选中态。
-->
<template>
  <BDraggable
    class="sidebar-panel__layer-list"
    :list="layerEntries"
    item-key="id"
    :item-class="getDraggableItemClass"
    handle-class="sidebar-panel__layer-drag-handle"
    @item-click="handleDraggableItemClick"
    @move="handleDraggableMove"
  >
    <template #default="{ item: entry, handleClass }">
      <template v-if="entry.type === 'group'">
        <div class="sidebar-panel__layer-group-header" :class="{ 'is-active': isEntrySelected(entry) }">
          <button type="button" :class="handleClass" @click.stop>
            <BIcon icon="lucide:grip-vertical" :size="14" />
          </button>
          <button type="button" class="sidebar-panel__layer-collapse" @click.stop="toggleGroupCollapsed(entry.groupId)">
            <BIcon :icon="isGroupExpanded(entry) ? 'lucide:chevron-down' : 'lucide:chevron-right'" :size="14" />
          </button>
          <button type="button" class="sidebar-panel__layer-select">
            <BIcon icon="lucide:group" :size="15" />
            <div class="sidebar-panel__layer-main">
              <span class="sidebar-panel__layer-group-title">{{ getGroupTitle(entry) }}</span>
            </div>
          </button>
          <div class="sidebar-panel__layer-actions">
            <BButton class="sidebar-panel__layer-action" type="text" size="mini" square icon="lucide:copy" @click.stop="handleEntryCopy(entry)" />
            <BButton class="sidebar-panel__layer-action" type="text" size="mini" danger square icon="lucide:trash-2" @click.stop="handleEntryDelete(entry)" />
          </div>
        </div>
        <div v-if="isGroupExpanded(entry)" class="sidebar-panel__layer-children">
          <div v-for="child in entry.elements" :key="child.id" class="sidebar-panel__layer-child" :class="{ 'is-active': isActiveChildElement(child) }">
            <button type="button" class="sidebar-panel__layer-select" @click.stop="handleElementClick(child)">
              <BIcon :icon="getElementIcon(child)" :size="15" />
              <div class="sidebar-panel__layer-main">
                <span class="sidebar-panel__layer-title">{{ child.title }}</span>
              </div>
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <button type="button" :class="handleClass" @click.stop>
          <BIcon icon="lucide:grip-vertical" :size="14" />
        </button>
        <button type="button" class="sidebar-panel__layer-select">
          <BIcon :icon="getElementIcon(entry.element)" :size="15" />
          <div class="sidebar-panel__layer-main">
            <span class="sidebar-panel__layer-title">{{ entry.element.title }}</span>
          </div>
        </button>
        <div class="sidebar-panel__layer-actions">
          <BButton class="sidebar-panel__layer-action" type="text" size="mini" square icon="lucide:copy" @click.stop="handleEntryCopy(entry)" />
          <BButton class="sidebar-panel__layer-action" type="text" size="mini" danger square icon="lucide:trash-2" @click.stop="handleEntryDelete(entry)" />
        </div>
      </template>
    </template>
  </BDraggable>
</template>

<script setup lang="ts">
import type { DrawingLayerMovePosition } from '../utils/layerOrder';
import { computed, ref } from 'vue';
import type { BDraggableMoveEvent } from '@/components/BDraggable/types';
import type { DrawingElement } from '@/components/BDrawing/types';
import { getDrawingElementGroupId } from '@/components/BDrawing/utils/drawingGroups';

/**
 * 单元素图层展示项。
 */
interface SidebarLayerElementEntry {
  /** 展示项类型 */
  type: 'element';
  /** 展示项唯一标识 */
  id: string;
  /** 画图元素 */
  element: DrawingElement;
}

/**
 * 组合图层展示项。
 */
interface SidebarLayerGroupEntry {
  /** 展示项类型 */
  type: 'group';
  /** 展示项唯一标识 */
  id: string;
  /** 组合 ID */
  groupId: string;
  /** 组合内元素，按侧栏视觉顺序排列 */
  elements: DrawingElement[];
}

/**
 * 图层列表展示项。
 */
type SidebarLayerEntry = SidebarLayerElementEntry | SidebarLayerGroupEntry;

/**
 * 图层列表入参。
 */
interface Props {
  /** 组合选区内当前编辑的元素 ID */
  activeElementId?: string | null;
  /** 当前画图元素列表 */
  elements: DrawingElement[];
  /** 当前选中的画图元素 ID 列表 */
  selectedElementIds?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  activeElementId: null,
  selectedElementIds: (): string[] => []
});
const emit = defineEmits<{
  /** 选择图层元素 */
  'select-element': [element: DrawingElement];
  /** 选择多个图层元素 */
  'select-elements': [elements: DrawingElement[]];
  /** 复制图层元素 */
  'copy-element': [element: DrawingElement];
  /** 复制多个图层元素 */
  'copy-elements': [elements: DrawingElement[]];
  /** 删除图层元素 */
  'delete-element': [element: DrawingElement];
  /** 删除多个图层元素 */
  'delete-elements': [elements: DrawingElement[]];
  /** 移动画布图层元素 */
  'move-element': [sourceElementId: string, targetElementId: string, position: DrawingLayerMovePosition];
  /** 移动画布图层展示项 */
  'move-elements': [sourceElementIds: string[], targetElementIds: string[], position: DrawingLayerMovePosition];
}>();

/** 当前选中元素 ID 集合。 */
const selectedElementIdSet = computed<Set<string>>(() => new Set(props.selectedElementIds));
/** 当前已折叠的组合 ID。 */
const collapsedGroupIds = ref<Set<string>>(new Set());

/**
 * 创建单元素展示项。
 * @param element - 画图元素
 * @returns 单元素展示项
 */
function createElementEntry(element: DrawingElement): SidebarLayerElementEntry {
  return {
    type: 'element',
    id: `element:${element.id}`,
    element
  };
}

/**
 * 创建组合展示项。
 * @param groupId - 组合 ID
 * @param elements - 组合元素
 * @returns 组合展示项
 */
function createGroupEntry(groupId: string, elements: DrawingElement[]): SidebarLayerGroupEntry {
  return {
    type: 'group',
    id: `group:${groupId}`,
    groupId,
    elements
  };
}

/**
 * 将画布元素转换为侧栏展示项，组合元素会收敛为一个组合行。
 * @param elements - 画布元素列表
 * @returns 侧栏展示项
 */
function createLayerEntries(elements: DrawingElement[]): SidebarLayerEntry[] {
  const displayElements = [...elements].reverse();
  const handledGroupIds = new Set<string>();

  return displayElements.reduce<SidebarLayerEntry[]>((entries: SidebarLayerEntry[], element: DrawingElement): SidebarLayerEntry[] => {
    const groupId = getDrawingElementGroupId(element);
    if (!groupId) {
      entries.push(createElementEntry(element));
      return entries;
    }

    if (handledGroupIds.has(groupId)) {
      return entries;
    }

    handledGroupIds.add(groupId);
    entries.push(
      createGroupEntry(
        groupId,
        displayElements.filter((item: DrawingElement): boolean => getDrawingElementGroupId(item) === groupId)
      )
    );

    return entries;
  }, []);
}

/** 按画布层级从上到下展示的元素列表。 */
const layerEntries = computed<SidebarLayerEntry[]>(() => createLayerEntries(props.elements));

/**
 * 读取展示项包含的画图元素。
 * @param entry - 图层展示项
 * @returns 展示项包含的画图元素
 */
function getEntryElements(entry: SidebarLayerEntry): DrawingElement[] {
  return entry.type === 'group' ? entry.elements : [entry.element];
}

/**
 * 读取组合展示标题。
 * @param entry - 组合展示项
 * @returns 组合标题
 */
function getGroupTitle(entry: SidebarLayerGroupEntry): string {
  return `组合 (${entry.elements.length})`;
}

/**
 * 判断组合是否展开。
 * @param entry - 组合展示项
 * @returns 是否展开
 */
function isGroupExpanded(entry: SidebarLayerGroupEntry): boolean {
  return !collapsedGroupIds.value.has(entry.groupId);
}

/**
 * 切换组合折叠状态。
 * @param groupId - 组合 ID
 */
function toggleGroupCollapsed(groupId: string): void {
  const nextCollapsedGroupIds = new Set(collapsedGroupIds.value);
  if (nextCollapsedGroupIds.has(groupId)) {
    nextCollapsedGroupIds.delete(groupId);
  } else {
    nextCollapsedGroupIds.add(groupId);
  }

  collapsedGroupIds.value = nextCollapsedGroupIds;
}

/**
 * 处理图层拖拽排序。
 * @param sourceElementId - 被移动元素 ID
 * @param targetElementId - 目标元素 ID
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementMove(sourceElementId: string, targetElementId: string, position: DrawingLayerMovePosition): void {
  emit('move-element', sourceElementId, targetElementId, position);
}

/**
 * 读取图层图标。
 * @param element - 画图元素
 * @returns 图层图标名称
 */
function getElementIcon(element: DrawingElement): string {
  return element.icon;
}

/**
 * 判断图层元素是否处于选中态。
 * @param element - 画图元素
 * @returns 是否选中
 */
function isElementSelected(element: DrawingElement): boolean {
  return selectedElementIdSet.value.has(element.id);
}

/**
 * 判断组合内子元素是否为当前编辑目标。
 * @param element - 组合内子元素
 * @returns 是否为当前编辑目标
 */
function isActiveChildElement(element: DrawingElement): boolean {
  return props.activeElementId === element.id;
}

/**
 * 判断展示项是否处于选中态。
 * @param entry - 图层展示项
 * @returns 是否选中
 */
function isEntrySelected(entry: SidebarLayerEntry): boolean {
  const elements = getEntryElements(entry);

  return elements.length > 0 && elements.every((element: DrawingElement): boolean => isElementSelected(element));
}

/**
 * 生成公共拖拽列表项 class。
 * @param entry - 图层展示项
 * @returns 列表项 class 映射
 */
function getDraggableItemClass(entry: SidebarLayerEntry): Record<string, boolean> {
  return {
    'sidebar-panel__layer-item': true,
    'is-active': isEntrySelected(entry),
    'is-group': entry.type === 'group'
  };
}

/**
 * 处理图层元素点击。
 * @param element - 被点击的画图元素
 */
function handleElementClick(element: DrawingElement): void {
  emit('select-element', element);
}

/**
 * 处理图层展示项点击。
 * @param entry - 被点击的图层展示项
 */
function handleEntryClick(entry: SidebarLayerEntry): void {
  if (entry.type === 'group') {
    emit('select-elements', entry.elements);
    return;
  }

  handleElementClick(entry.element);
}

/**
 * 处理图层元素复制。
 * @param element - 被复制的画图元素
 */
function handleElementCopy(element: DrawingElement): void {
  emit('copy-element', element);
}

/**
 * 处理图层展示项复制。
 * @param entry - 被复制的图层展示项
 */
function handleEntryCopy(entry: SidebarLayerEntry): void {
  if (entry.type === 'group') {
    emit('copy-elements', entry.elements);
    return;
  }

  handleElementCopy(entry.element);
}

/**
 * 处理图层元素删除。
 * @param element - 被删除的画图元素
 */
function handleElementDelete(element: DrawingElement): void {
  emit('delete-element', element);
}

/**
 * 处理图层展示项删除。
 * @param entry - 被删除的图层展示项
 */
function handleEntryDelete(entry: SidebarLayerEntry): void {
  if (entry.type === 'group') {
    emit('delete-elements', entry.elements);
    return;
  }

  handleElementDelete(entry.element);
}

/**
 * 处理公共拖拽组件发出的列表项点击。
 * @param entry - 被点击的图层展示项
 */
function handleDraggableItemClick(entry: SidebarLayerEntry): void {
  handleEntryClick(entry);
}

/**
 * 处理公共拖拽组件发出的移动事件。
 * @param event - 拖拽移动事件
 */
function handleDraggableMove(event: BDraggableMoveEvent<SidebarLayerEntry>): void {
  const sourceElements = getEntryElements(event.sourceItem);
  const targetElements = getEntryElements(event.targetItem);
  if (sourceElements.length === 1 && targetElements.length === 1) {
    handleElementMove(sourceElements[0].id, targetElements[0].id, event.position);
    return;
  }

  emit(
    'move-elements',
    sourceElements.map((element: DrawingElement): string => element.id),
    targetElements.map((element: DrawingElement): string => element.id),
    event.position
  );
}
</script>

<style lang="less" scoped>
.sidebar-panel__layer-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

:deep(.sidebar-panel__layer-item) {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 32px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: all 0.16s ease;

  &.is-group {
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
    height: auto;
    min-height: 32px;
    background: transparent;
    border-color: transparent;
  }

  &:not(.is-group).is-active,
  &.is-group .sidebar-panel__layer-group-header.is-active,
  .sidebar-panel__layer-child.is-active {
    color: var(--color-primary);
    background: var(--color-primary-bg);
    border-color: var(--color-primary-border);
  }

  &.is-dragging {
    opacity: 0.55;
  }

  &.is-active.is-dragging {
    border-color: transparent;
  }

  &:hover .sidebar-panel__layer-actions,
  &:focus-within .sidebar-panel__layer-actions {
    pointer-events: auto;
    opacity: 1;
  }
}

.sidebar-panel__layer-drag-handle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 100%;
  padding: 0;
  color: var(--text-secondary);
  appearance: none;
  cursor: grab;
  background: transparent;
  border: 0;
  opacity: 0.72;
  transition: all 0.16s ease;

  &:hover,
  &:focus-visible {
    color: var(--color-primary);
    opacity: 1;
  }
}

.sidebar-panel__layer-group-header {
  display: flex;
  align-items: center;
  width: 100%;
  height: 32px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: all 0.16s ease;
}

.sidebar-panel__layer-collapse {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 100%;
  padding: 0;
  color: var(--text-secondary);
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;

  &:hover,
  &:focus-visible {
    color: var(--color-primary);
  }
}

.sidebar-panel__layer-select {
  display: flex;
  flex: 1;
  gap: 9px;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.sidebar-panel__layer-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sidebar-panel__layer-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
}

.sidebar-panel__layer-group-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
}

.sidebar-panel__layer-children {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 0 0 24px;
}

.sidebar-panel__layer-child {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 32px;
  padding-left: 8px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: all 0.16s ease;
}

.sidebar-panel__layer-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  align-items: center;
  padding-right: 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.16s ease;
}
</style>
