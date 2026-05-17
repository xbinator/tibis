<template>
  <BScrollbar :class="bem('content')" inset="vertical">
    <TransitionGroup name="b-markdown-anchor-fade" tag="div">
      <div
        v-for="item in treeItems"
        :key="item.id"
        :ref="(el) => setItemRef(el as HTMLElement, item.id)"
        class="b-markdown-anchor__item"
        :class="{ active: activeId === item.id }"
        :style="item.style"
        @click="handleClick(item)"
      >
        <div v-if="item.children.length" class="b-markdown-anchor__toggle" @click.stop="toggleCollapsed(item.id)">
          <Icon :icon="isCollapsed(item.id) ? 'lucide:chevron-right' : 'lucide:chevron-down'" />
        </div>

        <span v-else class="b-markdown-anchor__toggle--empty"></span>

        <span class="b-markdown-anchor__text">{{ item.text }}</span>
      </div>
    </TransitionGroup>
  </BScrollbar>
</template>

<script setup lang="ts">
import { computed, CSSProperties, ref, watch, nextTick } from 'vue';
import { Icon } from '@iconify/vue';
import { createNamespace } from '@/utils/namespace';
import BScrollbar from '../../BScrollbar/index.vue';

const [, bem] = createNamespace('', 'b-markdown-anchor');

export interface AnchorItem {
  // 目录项id
  id: string;
  // 目录项文本
  text: string;
  // 目录项等级
  level: number;
}

interface AnchorTreeItem extends AnchorItem {
  children: AnchorTreeItem[];
}

interface VisibleAnchorItem extends AnchorTreeItem {
  depth: number;
  //
  style: CSSProperties;
}

interface Props {
  // 目录项
  items: AnchorItem[];
  // 当前选中的目录项id
  activeId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  activeId: ''
});

const emit = defineEmits(['click']);

const itemRefs = ref<Record<string, HTMLElement>>({});

function setItemRef(el: HTMLElement, id: string) {
  if (el) {
    itemRefs.value[id] = el;
  }
}

const collapsedIds = ref<Record<string, boolean>>({});

function handleClick(item: VisibleAnchorItem) {
  emit('click', item);
}

function toggleCollapsed(id: string) {
  collapsedIds.value[id] = !collapsedIds.value[id];
}

function isCollapsed(id: string): boolean {
  return !!collapsedIds.value[id];
}

function buildAnchorTree(items: AnchorTreeItem[], depth = 0): VisibleAnchorItem[] {
  return items.flatMap((item) => {
    const visibleItem = { ...item, depth, style: { paddingLeft: `${14 + depth * 16}px` } };

    if (isCollapsed(item.id)) {
      return [visibleItem];
    }

    return [visibleItem, ...buildAnchorTree(item.children, depth + 1)];
  });
}

const treeItems = computed(() => {
  const roots: AnchorTreeItem[] = [];
  const stack: AnchorTreeItem[] = [];

  for (let i = 0; i < props.items.length; i++) {
    const item = props.items[i];

    const node: AnchorTreeItem = { ...item, children: [] };

    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    (stack.length ? stack[stack.length - 1].children : roots).push(node);

    stack.push(node);
  }

  return buildAnchorTree(roots);
});

watch(
  () => props.activeId,
  (newId) => {
    if (!newId) return;

    nextTick(() => {
      const activeEl = itemRefs.value[newId];
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
);
</script>

<style lang="less" scoped>
.b-markdown-anchor__content {
  padding: 2px 0 8px 8px;
}

.b-markdown-anchor__item {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 32px;
  padding-right: 12px;
  margin-bottom: 2px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
  }

  &.active {
    background: var(--color-primary-bg);
  }
}

.b-markdown-anchor__toggle {
  display: inline-flex;
  flex: 0 0 18px;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
  }
}

.b-markdown-anchor__toggle--empty {
  width: 18px;
  height: 18px;
}

.b-markdown-anchor__text {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.b-markdown-anchor-fade-enter-active,
.b-markdown-anchor-fade-leave-active {
  overflow: hidden;
  transition: all 0.2s ease;
}

.b-markdown-anchor-fade-enter-from,
.b-markdown-anchor-fade-leave-to {
  min-height: 0;
  max-height: 0;
  opacity: 0;
}

.b-markdown-anchor-fade-enter-to,
.b-markdown-anchor-fade-leave-from {
  max-height: 28px;
}
</style>
