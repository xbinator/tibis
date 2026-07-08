<!--
  @file PanelSidebar.vue
  @description Widget 页面左侧工具、图层、数据源和动作侧边栏，tabs 列常驻显示；动作面板可像 ChatSider 一样通过展开态样式覆盖画布并避让右侧设置栏。
-->
<template>
  <aside :class="bem({ expanded: isExpanded, overlay: true })" :style="sidebarStyle">
    <div :class="bem('tabs')">
      <template v-for="tab in sidebarTabs" :key="tab.key">
        <BButton :type="activeSidebarTab === tab.key ? 'secondary' : 'ghost'" square :icon="tab.icon" @click="handleTabClick(tab.key)" />
      </template>
    </div>

    <BPanelSplitter
      v-model:size="size"
      :class="bem('splitter', { expanded: isExpanded, dragging: isDragging })"
      :disabled="isExpanded"
      :max-width="SIDEBAR_MAX_SIZE"
      :min-width="SIDEBAR_MIN_SIZE"
      position="right"
    >
      <div :class="bem('content')">
        <SidebarTools v-if="activeSidebarTab === 'tools'" @drag-start="handleDragStart" />
        <SidebarLayer
          v-else-if="activeSidebarTab === 'layers'"
          :active-element-id="activeElementId"
          :elements="elements"
          :selected-element-ids="selectedElementIds"
          @select-element="handleElementSelect"
          @select-elements="handleElementsSelect"
          @copy-element="handleElementCopy"
          @copy-elements="handleElementsCopy"
          @delete-element="handleElementDelete"
          @delete-elements="handleElementsDelete"
          @move-element="handleElementMove"
          @move-elements="handleElementsMove"
        />
        <SidebarState v-else-if="activeSidebarTab === 'data-source'" v-model:value="dataItem" />
        <SidebarAction
          v-else-if="activeSidebarTab === 'action'"
          v-model:value="dataItem"
          :active="activeSidebarTab === 'action'"
          @save="emit('save')"
          @expand="handleExpand"
          @collapse="handleCollapse"
        />
      </div>
    </BPanelSplitter>
  </aside>
</template>

<script setup lang="ts">
import type { WidgetLayerMovePosition } from '../utils/layerOrder';
import type { CSSProperties } from 'vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import type { WidgetData, WidgetElement } from '@/components/BWidget/types';
import { createNamespace } from '@/utils/namespace';
import SidebarAction from './SidebarAction.vue';
import SidebarLayer from './SidebarLayer.vue';
import SidebarState from './SidebarState.vue';
import SidebarTools from './SidebarTools.vue';

/**
 * 左侧侧边栏页签类型。
 */
type WidgetSidebarTabKey = 'tools' | 'layers' | 'data-source' | 'action';

/**
 * 当前激活的左侧侧边栏页签。
 */
type ActiveWidgetSidebarTabKey = WidgetSidebarTabKey | null;

/**
 * 左侧侧边栏页签配置。
 */
interface WidgetSidebarTab {
  /** 页签标识 */
  key: WidgetSidebarTabKey;
  /** 页签显示名称 */
  label: string;
  /** 页签图标 */
  icon: string;
}

/**
 * Widget 侧边栏根元素内联样式。
 */
type WidgetSidebarStyle = CSSProperties & {
  /** 右侧设置面板宽度，用于展开态避让。 */
  '--widget-sidebar-settings-width': string;
};

/**
 * Widget侧边栏入参。
 */
interface Props {
  /** 组合选区内当前编辑的元素 ID */
  activeElementId?: string | null;
  /** 当前Widget元素列表 */
  elements: WidgetElement[];
  /** 当前选中的Widget元素 ID 列表 */
  selectedElementIds?: string[];
  /** 右侧设置面板宽度（px），用于计算「动作」tab 展开态的最大宽度 */
  settingsWidth?: number;
}

const [, bem] = createNamespace('widget-sidebar', '');

const props = withDefaults(defineProps<Props>(), {
  activeElementId: null,
  selectedElementIds: (): string[] => [],
  settingsWidth: 300
});

/** 当前 Widget 完整数据（透传给侧栏子面板）。 */
const dataItem = defineModel<WidgetData>('value', { required: true });

const emit = defineEmits<{
  /** 选择侧栏图层元素 */
  'select-element': [element: WidgetElement];
  /** 选择多个侧栏图层元素 */
  'select-elements': [elements: WidgetElement[]];
  /** 复制侧栏图层元素 */
  'copy-element': [element: WidgetElement];
  /** 复制多个侧栏图层元素 */
  'copy-elements': [elements: WidgetElement[]];
  /** 删除侧栏图层元素 */
  'delete-element': [element: WidgetElement];
  /** 删除多个侧栏图层元素 */
  'delete-elements': [elements: WidgetElement[]];
  /** 移动侧栏图层元素 */
  'move-element': [sourceElementId: string, targetElementId: string, position: WidgetLayerMovePosition];
  /** 移动多个侧栏图层元素 */
  'move-elements': [sourceElementIds: string[], targetElementIds: string[], position: WidgetLayerMovePosition];
  /** 请求保存当前 Widget 文件（来自运行脚本编辑器 Ctrl+S） */
  save: [];
}>();

/** 左侧侧边栏页签列表（标签与图标的单一来源）。 */
const sidebarTabs: WidgetSidebarTab[] = [
  { key: 'tools', label: '组件', icon: 'lucide:box' },
  { key: 'layers', label: '图层', icon: 'lucide:layers' },
  { key: 'data-source', label: '数据源', icon: 'lucide:database-zap' },
  { key: 'action', label: '动作', icon: 'lucide:file-code-corner' }
];

/** 内容区最小宽度，保障 schema 树和动作编辑器基础可用空间。 */
const SIDEBAR_MIN_SIZE = 280;

/** 内容区默认宽度；侧栏关闭后点击 tab 时恢复到该值。 */
const SIDEBAR_DEFAULT_SIZE = 320;

/** 普通拖拽态最大宽度；展开态通过 CSS 覆盖整段画布空间。 */
const SIDEBAR_MAX_SIZE = 440;

/** 内容区宽度（内部状态），为 0 时表示侧栏已关闭。 */
const size = ref(SIDEBAR_DEFAULT_SIZE);

/** 当前激活的侧栏 tab。 */
const activeSidebarTab = ref<ActiveWidgetSidebarTabKey>('tools');

/** 当前是否处于展开态（由「动作」tab 触发）。 */
const isExpanded = ref(false);
/** 当前是否处于拖拽创建元素状态。 */
const isDragging = ref(false);
/** 拖拽期间的全局指针监听控制器。 */
let dragAbortController: AbortController | null = null;

/** 根元素样式变量，展开态用它给右侧设置栏让位。 */
const sidebarStyle = computed<WidgetSidebarStyle>(
  (): WidgetSidebarStyle => ({
    '--widget-sidebar-settings-width': `${props.settingsWidth}px`
  })
);

/**
 * 处理「动作」tab 展开事件：只切换布局状态，保留普通态拖拽宽度。
 */
function handleExpand(): void {
  isExpanded.value = true;
}

/**
 * 处理「动作」tab 收起事件：恢复普通侧栏布局。
 */
function handleCollapse(): void {
  isExpanded.value = false;
}

/**
 * 清理拖拽期间的全局指针监听。
 */
function cleanupDragListeners(): void {
  dragAbortController?.abort();
  dragAbortController = null;
}

/**
 * 恢复左侧面板内容区展示。
 */
function restoreDraggingSidebar(): void {
  isDragging.value = false;
  cleanupDragListeners();
}

/**
 * 处理拖拽开始，临时隐藏内容区 splitter 以释放画布操作区域。
 */
function handleDragStart(): void {
  isDragging.value = true;
  cleanupDragListeners();
  dragAbortController = new AbortController();
  window.addEventListener('pointerup', restoreDraggingSidebar, { signal: dragAbortController.signal });
  window.addEventListener('pointercancel', restoreDraggingSidebar, { signal: dragAbortController.signal });
}

/**
 * 切换左侧侧边栏页签。
 *
 * - 正常态（size > 0）：仅切换 tab
 * - 关闭态（size = 0）：先恢复默认宽度，再切换 tab
 * @param key - 目标页签标识
 */
function handleTabClick(key: WidgetSidebarTabKey): void {
  // 切换到非「动作」tab 时退出覆盖布局，但保留用户拖拽后的普通态宽度。
  if (key !== 'action' && isExpanded.value) {
    isExpanded.value = false;
  }

  if (size.value <= 0) {
    size.value = SIDEBAR_DEFAULT_SIZE;
  }

  activeSidebarTab.value = key;
}

/**
 * 处理图层列表选择。
 * @param element - 被选择的Widget元素
 */
function handleElementSelect(element: WidgetElement): void {
  emit('select-element', element);
}

/**
 * 处理图层列表多选。
 * @param elements - 被选择的Widget元素
 */
function handleElementsSelect(elements: WidgetElement[]): void {
  emit('select-elements', elements);
}

/**
 * 处理图层列表复制。
 * @param element - 被复制的Widget元素
 */
function handleElementCopy(element: WidgetElement): void {
  emit('copy-element', element);
}

/**
 * 处理图层列表多元素复制。
 * @param elements - 被复制的Widget元素
 */
function handleElementsCopy(elements: WidgetElement[]): void {
  emit('copy-elements', elements);
}

/**
 * 处理图层列表删除。
 * @param element - 被删除的Widget元素
 */
function handleElementDelete(element: WidgetElement): void {
  emit('delete-element', element);
}

/**
 * 处理图层列表多元素删除。
 * @param elements - 被删除的Widget元素
 */
function handleElementsDelete(elements: WidgetElement[]): void {
  emit('delete-elements', elements);
}

/**
 * 处理图层列表拖拽排序。
 * @param sourceElementId - 被移动元素 ID
 * @param targetElementId - 目标元素 ID
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementMove(sourceElementId: string, targetElementId: string, position: WidgetLayerMovePosition): void {
  emit('move-element', sourceElementId, targetElementId, position);
}

/**
 * 处理图层列表多元素拖拽排序。
 * @param sourceElementIds - 被移动元素 ID 列表
 * @param targetElementIds - 目标元素 ID 列表
 * @param position - 基于侧栏视觉顺序的插入位置
 */
function handleElementsMove(sourceElementIds: string[], targetElementIds: string[], position: WidgetLayerMovePosition): void {
  emit('move-elements', sourceElementIds, targetElementIds, position);
}

onBeforeUnmount((): void => {
  cleanupDragListeners();
});
</script>

<style lang="less" scoped>
.widget-sidebar {
  display: flex;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
}

.widget-sidebar--overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  pointer-events: none;
}

.widget-sidebar--overlay .widget-sidebar__tabs,
.widget-sidebar--overlay .widget-sidebar__splitter {
  pointer-events: auto;
}

.widget-sidebar--expanded {
  right: var(--widget-sidebar-settings-width);
  background: var(--bg-primary);
}

.widget-sidebar__tabs {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 6px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-primary);
}

.widget-sidebar__splitter {
  flex-shrink: 0;
}

.widget-sidebar__splitter--dragging {
  width: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
}

.widget-sidebar__splitter--dragging :deep(.b-panel-splitter__section) {
  width: 0 !important;
}

.widget-sidebar__splitter--expanded {
  flex: 1;
  width: 0;
}

.widget-sidebar__splitter--expanded :deep(.b-panel-splitter__section) {
  width: 100% !important;
}

.widget-sidebar__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-primary);
}
</style>
