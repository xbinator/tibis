<template>
  <BPanelSplitter v-model:size="sidebarWidth" position="right" :min-width="180" :max-width="400">
    <div class="b-markdown-sidebar">
      <div v-if="title" class="sidebar__header">
        <div class="sidebar__main" @click="handleTitleClick">
          <BIcon icon="lucide:file-text" :size="14" class="sidebar__file-icon" />
          <span class="sidebar__title">{{ title }}</span>
        </div>
      </div>
      <div v-if="items.length" class="sidebar__content">
        <AnchorContent :items="items" :active-id="activeId" @click="handleAnchorClick" />
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

const emit = defineEmits(['change']);

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
  min-height: 32px;
  padding: 0 4px 0 8px;
  margin: 16px 8px 0;
  color: var(--text-primary);
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
  }
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

.sidebar__file-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.sidebar__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
</style>
