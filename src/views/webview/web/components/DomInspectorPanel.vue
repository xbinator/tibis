<template>
  <div class="dom-inspector-panel">
    <header class="dom-inspector-panel__header">
      <div class="dom-inspector-panel__title">
        <span>组件</span>
      </div>
      <BButton type="text" size="small" square icon="lucide:x" tooltip="关闭" @click="emit('close')" />
    </header>

    <div v-if="selection" class="dom-inspector-panel__body">
      <section class="dom-inspector-panel__section">
        <div class="dom-inspector-panel__section-title">元素</div>
        <div class="dom-inspector-panel__selector-row">
          <code class="dom-inspector-panel__selector">{{ selection.selector }}</code>
          <BButton type="text" size="small" square icon="lucide:copy" tooltip="复制 selector" @click="copyText(selection.selector)" />
        </div>
        <div class="dom-inspector-panel__meta">
          <span>{{ normalizedTagName }}</span>
          <span>{{ roundedRect.width }} x {{ roundedRect.height }}</span>
          <span>x {{ roundedRect.x }} / y {{ roundedRect.y }}</span>
        </div>
        <p v-if="selection.text" class="dom-inspector-panel__text">
          {{ selection.text }}
        </p>
      </section>

      <section class="dom-inspector-panel__section">
        <div class="dom-inspector-panel__section-title">层级</div>
        <ol class="dom-inspector-panel__tree">
          <li
            v-for="item in hierarchyItems"
            :key="item.selector"
            :class="{ 'dom-inspector-panel__tree-item--active': item.isActive }"
            class="dom-inspector-panel__tree-item"
          >
            <code>{{ item.selector }}</code>
          </li>
        </ol>
      </section>

      <section class="dom-inspector-panel__section">
        <div class="dom-inspector-panel__section-title">属性</div>
        <dl v-if="selection.attributes.length" class="dom-inspector-panel__pairs">
          <div v-for="attribute in selection.attributes" :key="attribute.name" class="dom-inspector-panel__pair">
            <dt>{{ attribute.name }}</dt>
            <dd>
              <span>{{ attribute.value }}</span>
              <BButton type="text" size="small" square icon="lucide:copy" tooltip="复制属性值" @click="copyText(attribute.value)" />
            </dd>
          </div>
        </dl>
        <div v-else class="dom-inspector-panel__empty">没有属性</div>
      </section>

      <section class="dom-inspector-panel__section">
        <div class="dom-inspector-panel__section-title">CSS 样式</div>
        <dl class="dom-inspector-panel__pairs">
          <div v-for="styleEntry in styleEntries" :key="styleEntry.name" class="dom-inspector-panel__pair">
            <dt>{{ styleEntry.name }}</dt>
            <dd>{{ styleEntry.value || '-' }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <div v-else class="dom-inspector-panel__empty-state">
      <BIcon icon="lucide:mouse-pointer-click" :size="22" />
      <span>点击页面元素后显示层级、属性和样式</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file DomInspectorPanel.vue
 * @description 展示 WebView 页面 DOM 元素层级、属性与计算样式。
 */
import { computed } from 'vue';
import type { WebviewElementSelection } from '@/views/webview/shared/types';

/**
 * DOM 看板组件属性。
 */
interface Props {
  /** 当前选中的 DOM 元素信息 */
  selection?: WebviewElementSelection | null;
}

const props = withDefaults(defineProps<Props>(), {
  selection: null
});

const emit = defineEmits<{
  close: [];
}>();

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

const normalizedTagName = computed(() => props.selection?.tagName.toLowerCase() ?? '');
// 计算元素矩形框的四舍五入坐标
const roundedRect = computed(() => {
  const rect = props.selection?.rect;
  return {
    x: Math.round(rect?.x ?? 0),
    y: Math.round(rect?.y ?? 0),
    width: Math.round(rect?.width ?? 0),
    height: Math.round(rect?.height ?? 0)
  };
});

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

const styleEntries = computed<StyleEntry[]>(() => {
  if (!props.selection) {
    return [];
  }

  return Object.entries(props.selection.computedStyles).map(([name, value]) => ({
    name,
    value
  }));
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

<style scoped lang="less">
.dom-inspector-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-primary);
  border-left: 1px solid var(--border-primary);
}

.dom-inspector-panel__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 10px 0 12px;
  border-bottom: 1px solid var(--border-primary);
}

.dom-inspector-panel__title {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.dom-inspector-panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.dom-inspector-panel__section {
  padding: 12px;
  border-bottom: 1px solid var(--border-primary);

  &:last-child {
    border-bottom: none;
  }
}

.dom-inspector-panel__section-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.dom-inspector-panel__selector-row {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  min-width: 0;
}

.dom-inspector-panel__selector {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 6px;
  font-size: 12px;
  color: var(--color-primary);
  overflow-wrap: anywhere;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.dom-inspector-panel__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.dom-inspector-panel__meta span {
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.dom-inspector-panel__text {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.dom-inspector-panel__tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.dom-inspector-panel__tree-item {
  padding: 4px 6px;
  font-size: 12px;
  overflow-wrap: anywhere;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.dom-inspector-panel__tree-item--active {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.dom-inspector-panel__pairs {
  display: grid;
  gap: 6px;
  margin: 0;
}

.dom-inspector-panel__pair {
  display: grid;
  grid-template-columns: minmax(96px, 38%) minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  font-size: 12px;
}

.dom-inspector-panel__pair dt {
  min-width: 0;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.dom-inspector-panel__pair dd {
  display: flex;
  gap: 4px;
  align-items: flex-start;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.dom-inspector-panel__pair dd span {
  flex: 1 1 auto;
  min-width: 0;
}

.dom-inspector-panel__empty,
.dom-inspector-panel__empty-state {
  color: var(--text-secondary);
}

.dom-inspector-panel__empty-state {
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
