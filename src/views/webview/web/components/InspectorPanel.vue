<template>
  <div :class="$style.panel">
    <header :class="$style.header">
      <div :class="$style.title">
        <span>组件</span>
      </div>
    </header>

    <div v-if="selection" :class="$style.body">
      <RenderSectionBlock title="元素">
        <RenderSectionItem label="选择器">
          <code :class="$style.infoValueItem">{{ selection.selector }}</code>
          <BButton type="text" size="small" square icon="lucide:copy" tooltip="复制 selector" @click="copyText(selection.selector)" />
        </RenderSectionItem>
        <RenderSectionItem label="位置" :values="[roundedRect.x, roundedRect.y]" />
        <RenderSectionItem label="大小" :values="[roundedRect.width, roundedRect.height]" />
        <RenderSectionItem v-if="selection.text" label="文本" :values="[selection.text]" />
      </RenderSectionBlock>

      <RenderSectionBlock title="层级">
        <ol :class="$style.tree">
          <li v-for="item in hierarchyItems" :key="item.selector" :class="[$style.treeItem, { [$style.treeItemActive]: item.isActive }]">
            <code>{{ item.selector }}</code>
          </li>
        </ol>
      </RenderSectionBlock>

      <RenderSectionBlock v-if="attributes.length" title="属性">
        <RenderSectionItem v-for="attribute in attributes" :key="attribute.name" :label="attribute.name" :values="[attribute.value]" />
      </RenderSectionBlock>

      <RenderSectionBlock v-if="styleEntries.length" title="CSS 样式">
        <RenderSectionItem v-for="styleEntry in styleEntries" :key="styleEntry.name" :label="styleEntry.name" :values="[styleEntry.value]" />
      </RenderSectionBlock>
    </div>

    <div v-else :class="$style.emptyState">
      <BIcon icon="lucide:mouse-pointer-click" :size="22" />
      <span>点击页面元素后显示层级、属性和样式</span>
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
import type { WebviewElementSelection } from '@/views/webview/shared/types';

const $style = useCssModule();

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
 * DOM 层级展示项。
 */
interface HierarchyItem {
  /** 层级选择器 */
  selector: string;
  /** 是否为当前选中元素 */
  isActive: boolean;
}

/**
 * CSS 样式展示项。
 */
interface StyleEntry {
  /** 样式属性名 */
  name: string;
  /** 样式属性值 */
  value: string;
}

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
  if (!props.selection) {
    return [];
  }

  const ancestorItems = props.selection.ancestors.map((ancestor) => ({
    selector: ancestor.selector,
    isActive: false
  }));

  return [
    ...ancestorItems,
    {
      selector: props.selection.selector,
      isActive: true
    }
  ];
});

/** 有值的属性列表（过滤掉空值） */
const attributes = computed(() => props.selection?.attributes.filter((a) => a.value) ?? []);

/** CSS 默认值，不展示 */
const CSS_DEFAULT_VALUES = new Set(['normal', 'none', 'auto', 'initial', 'inherit', 'unset', '']);

function collapseBoxStyles(styles: Record<string, string>) {
  const result = { ...styles };

  for (const prefix of ['margin', 'padding'] as const) {
    const values = [styles[`${prefix}-top`], styles[`${prefix}-right`], styles[`${prefix}-bottom`], styles[`${prefix}-left`]];

    if (values.some((value) => !value)) {
      continue;
    }

    const [top, right, bottom, left] = values;

    let shorthand: string;

    if (top === right && top === bottom && top === left) {
      shorthand = top;
    } else if (top === bottom && right === left) {
      shorthand = `${top} ${right}`;
    } else if (right === left) {
      shorthand = `${top} ${right} ${bottom}`;
    } else {
      shorthand = `${top} ${right} ${bottom} ${left}`;
    }

    result[prefix] = shorthand;

    delete result[`${prefix}-top`];
    delete result[`${prefix}-right`];
    delete result[`${prefix}-bottom`];
    delete result[`${prefix}-left`];
  }

  return result;
}

const isVisibleStyleValue = (value: unknown): boolean => {
  const normalized = String(value).trim().toLowerCase();

  if (CSS_DEFAULT_VALUES.has(normalized)) {
    return false;
  }

  return !/^0(?:px|rem|em|%|vh|vw)?$/.test(normalized);
};

/** 计算样式键值对（过滤空值和默认值） */
const styleEntries = computed<StyleEntry[]>(() => {
  const styles = props.selection?.computedStyles;

  if (!styles) {
    return [];
  }

  return Object.entries(collapseBoxStyles(styles))
    .filter(([, value]) => isVisibleStyleValue(value))
    .map(([name, value]) => ({ name, value }));
});

/**
 * 复制看板中的文本内容。
 * @param value - 需要复制的文本
 */
async function copyText(value: string): Promise<void> {
  if (!value || !navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(value);
}
</script>

<style module lang="less">
.section {
  padding: 12px;
  border-bottom: 1px solid var(--border-primary);

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
  border-left: 1px solid var(--border-primary);
}

.header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 10px 0 12px;
  border-bottom: 1px solid var(--border-primary);
}

.title {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
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
}

.infoValueGroup {
  display: flex;
  flex: 1;
  gap: 8px;
}

.infoValueItem {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 4px 6px;
  font-size: 12px;
  overflow-wrap: anywhere;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.tree-item {
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

.empty,
.empty-state {
  color: var(--text-secondary);
}

.empty-state {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-size: 13px;
  text-align: center;
}
</style>
