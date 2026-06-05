<template>
  <BPanelSplitter v-model:size="sidebarWidth" position="right" :min-width="180" :max-width="400" @close="emit('close')">
    <div class="b-markdown-sidebar">
      <div v-if="title" class="sidebar__header">
        <div class="sidebar__main" @click="handleTitleClick">
          <BIcon icon="lucide:bookmark" />
          <span class="sidebar__title">{{ title }}</span>
        </div>
      </div>
      <div v-if="items.length" class="sidebar__content">
        <AnchorContent :items="items" :active-id="activeId" @click="handleAnchorClick" />
      </div>
      <div v-else class="sidebar__empty">
        <span class="sidebar__empty-text">暂无标题大纲</span>
      </div>
    </div>
  </BPanelSplitter>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { marked, Tokens } from 'marked';
import AnchorContent, { AnchorItem } from './AnchorContent.vue';

interface Props {
  title?: string;
  content?: string;
  anchorIdPrefix?: string;
  // 当前选中的锚点id
  activeId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  content: '',
  anchorIdPrefix: '',
  activeId: ''
});

const emit = defineEmits(['change', 'close']);

const sidebarWidth = ref(260);

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s*/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

const items = computed(() => {
  if (!props.content) return [];

  const tokens = marked.lexer(props.content);

  const headings = tokens.filter((t) => t.type === 'heading' && t.text?.trim()) as Tokens.Heading[];

  const _headings = headings.map((t, i) => ({
    id: props.anchorIdPrefix ? `${props.anchorIdPrefix}-heading-${i}` : `heading-${i}`,
    text: stripMarkdown(t.text.trim()),
    level: t.depth
  }));

  const minLevel = Math.min(..._headings.map((h) => h.level));

  return _headings.map((h) => ({ ...h, level: h.level - minLevel + 1 }));
});

function handleAnchorClick(item: AnchorItem) {
  emit('change', item);
}

function handleTitleClick() {
  emit('change', { id: '', text: '', level: 0 });
}
</script>

<style scoped>
.b-markdown-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  border-radius: 8px;
  backdrop-filter: blur(10px);
}

.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-primary);
}

.sidebar__main {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: center;
  min-width: 0;
  cursor: pointer;
}

.sidebar__content {
  flex: 1;
  height: 0;
}

.sidebar__empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
}

.sidebar__empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.sidebar__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
</style>
