<template>
  <div :class="$style.panel">
    <header :class="$style.header">
      <div :class="$style.title">
        <span>组件</span>
      </div>
      <BButton type="text" size="small" square icon="lucide:x" :class="$style.closeButton" @click="emit('close')" />
    </header>

    <BScrollbar v-if="selection" :class="$style.body">
      <RenderSectionBlock title="元素">
        <RenderSectionItem label="选择器">
          <code :class="$style.infoValueItem">{{ selection.selector }}</code>
          <BButton type="text" size="small" square icon="lucide:copy" @click="copyText(selection.selector)" />
        </RenderSectionItem>
        <RenderSectionItem label="位置" :values="[roundedRect.x, roundedRect.y]" />
        <RenderSectionItem label="大小" :values="[roundedRect.width, roundedRect.height]" />
        <RenderSectionItem v-if="selection.text" label="文本" :values="[selection.text]" />
      </RenderSectionBlock>

      <RenderSectionBlock title="层级">
        <ol :class="$style.tree">
          <li v-for="item in hierarchyItems" :key="item.selector" :class="[$style.treeItem, { [$style.treeItemActive]: item.isActive }]">
            <span :class="$style.treeItemTag">{{ item.tagName }}</span>
            <code :class="$style.treeItemSelector">{{ item.displaySelector }}</code>
          </li>
        </ol>
      </RenderSectionBlock>

      <RenderSectionBlock v-if="attributes.length" title="属性">
        <RenderSectionItem v-for="attribute in attributes" :key="attribute.name" :label="attribute.name" :values="[attribute.value]" />
      </RenderSectionBlock>

      <RenderSectionBlock v-if="styleEntries.length" title="CSS 样式">
        <div :class="$style.styleEntries">
          <div v-for="styleEntry in styleEntries" :key="styleEntry.name" :class="$style.styleEntry">
            <span :class="$style.styleEntryName">{{ styleEntry.name }}:</span>
            <span :class="$style.styleEntryValue">{{ styleEntry.value }};</span>
          </div>
        </div>
      </RenderSectionBlock>
    </BScrollbar>

    <div v-else :class="$style.emptyState">
      <div :class="$style.emptyStateIcon">
        <BIcon icon="lucide:mouse-pointer-click" :size="20" />
      </div>
      <div :class="$style.emptyStateText">
        <span :class="$style.emptyStateTitle">选择页面元素</span>
        <span :class="$style.emptyStateDesc">点击页面中的元素，查看其层级结构、属性和样式信息</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="tsx">
/**
 * @file InspectorPanel.vue
 * @description 展示 WebView 页面 DOM 元素层级、属性与计算样式。
 */
import { computed, useCssModule } from 'vue';
import type { SetupContext, VNode } from 'vue';
import { useClipboard } from '@/hooks/useClipboard';
import type { WebviewElementSelection } from '@/views/webview/shared/types';
import { filterStyleEntries } from '@/views/webview/web/utils/styles';
import type { StyleEntry } from '@/views/webview/web/utils/styles';

const $style = useCssModule();
const { clipboard } = useClipboard();

/**
 * 面板分区块组件，封装统一的 section 标题 + 内容插槽结构。
 */
function RenderSectionBlock({ title }: { title: string }, { slots }: SetupContext) {
  return (
    <div class={$style.section}>
      <div class={$style.sectionTitle}>{title}</div>
      {slots.default?.()}
    </div>
  );
}

/**
 * 信息行组件，封装标签 + 值的布局。
 * 支持传入数组，让多个值平分剩余空间。
 */
function RenderSectionItem({ label, values }: { label: string; values?: (string | number)[] }, { slots }: SetupContext) {
  let contentNode: VNode | undefined;

  if (slots.default) {
    contentNode = <div class={$style.infoValue}>{slots.default()}</div>;
  } else if (values && values.length > 0) {
    contentNode = (
      <div class={$style.infoValueGroup}>
        {values.map((value, index) => (
          <span key={index} class={$style.infoValueItem}>
            {value}
          </span>
        ))}
      </div>
    );
  } else {
    contentNode = <span class={$style.infoValue}>-</span>;
  }

  return (
    <div class={$style.infoRow}>
      <span class={$style.infoLabel}>{label}</span>
      {contentNode}
    </div>
  );
}

/**
 * DOM 看板组件属性。
 */
interface Props {
  /** 当前选中的 DOM 元素信息 */
  selection?: WebviewElementSelection | null;
}

const props = withDefaults(defineProps<Props>(), { selection: null });

/**
 * 面板事件。点击关闭按钮时触发，由父组件决定如何隐藏面板与停止元素选择模式。
 */
const emit = defineEmits<{
  close: [];
}>();

/**
 * DOM 层级展示项。
 */
interface HierarchyItem {
  /** 完整 CSS 选择器 */
  selector: string;
  /** 元素标签名 */
  tagName: string;
  /** 去除前导标签名后的显示用选择器 */
  displaySelector: string;
  /** 是否为当前选中元素 */
  isActive: boolean;
}

/** 有值的属性列表（过滤掉空值） */
const attributes = computed(() => props.selection?.attributes.filter((a) => a.value) ?? []);

/** 元素矩形框的四舍五入坐标 */
const roundedRect = computed(() => {
  const rect = props.selection?.rect;
  return {
    x: Math.round(rect?.x ?? 0),
    y: Math.round(rect?.y ?? 0),
    width: Math.round(rect?.width ?? 0),
    height: Math.round(rect?.height ?? 0)
  };
});

/** 祖先层级 + 当前元素 */
const hierarchyItems = computed<HierarchyItem[]>(() => {
  if (!props.selection) return [];

  const buildItem = (selector: string, tagName: string, isActive: boolean): HierarchyItem => {
    const lowerTag = tagName.toLowerCase();
    /** selector 去除前导 tagName，若去完后为空则保留原值 */
    const displaySelector = selector.slice(lowerTag.length) || selector;
    return { selector, tagName: lowerTag, displaySelector, isActive };
  };

  const ancestorItems = props.selection.ancestors
    .filter((ancestor) => !['html', 'body'].includes(ancestor.tagName.toLowerCase()))
    .map((ancestor) => buildItem(ancestor.selector, ancestor.tagName, false));

  return [...ancestorItems, buildItem(props.selection.selector, props.selection.tagName, true)];
});

/** 计算样式键值对（过滤空值、默认值、以及标签默认 display） */
const styleEntries = computed<StyleEntry[]>(() => filterStyleEntries(props.selection?.computedStyles, props.selection?.tagName));

/**
 * 复制看板中的文本内容。
 * @param value - 需要复制的文本
 */
function copyText(value: string): void {
  clipboard(value, { successMessage: '已复制选择器' });
}
</script>

<style module lang="less">
.section {
  padding: 12px;
  border-bottom: 1px solid var(--border-secondary);

  &:last-child {
    border-bottom: none;
  }
}

.sectionTitle {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-primary);
  border-left: 1px solid var(--border-secondary);
}

.header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 10px 0 12px;
  border-bottom: 1px solid var(--border-secondary);
}

.title {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.closeButton {
  flex-shrink: 0;
}

.body {
  flex: 1 1 auto;
  min-height: 0;
}

.infoRow {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.infoLabel {
  flex-shrink: 0;
  width: 72px;
  font-size: 12px;
  color: var(--text-secondary);
}

.infoValue {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: flex-start;
  min-width: 0;
  font-size: 12px;
  user-select: text;
}

.infoValueGroup {
  display: flex;
  flex: 1;
  gap: 8px;
}

.infoValueItem {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: center;
  min-width: 0;
  min-height: 28px;
  padding: 4px 6px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
  user-select: text;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.styleEntries {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  user-select: text;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.styleEntry {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.styleEntryName {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.styleEntryValue {
  flex: 1;
  min-width: 0;
}

.tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  margin: 0;
  user-select: text;
  list-style: none;
}

.tree-item {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 6px;
  font-size: 12px;
  overflow-wrap: anywhere;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.tree-item--active {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.treeItemTag {
  flex-shrink: 0;
  padding: 1px 5px;
  margin-right: 4px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 10px;
  line-height: 16px;
  color: var(--text-secondary);
  text-transform: lowercase;
  background: var(--bg-hover);
  border-radius: 4px;
}

.tree-item--active .treeItemTag {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.treeItemSelector {
  min-width: 0;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.emptyState {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}

.emptyStateIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.emptyStateText {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  max-width: 200px;
  text-align: center;
}

.emptyStateTitle {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.emptyStateDesc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary);
}
</style>
