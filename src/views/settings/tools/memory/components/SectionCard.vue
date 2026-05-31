<!--
  @file MemorySectionCard.vue
  @description 记忆分区卡片组件，支持折叠展开和条目删除。
-->
<template>
  <div class="memory-section-card">
    <div class="memory-section-card__header" @click="toggleExpanded">
      <Icon :icon="getCategoryIcon(section.category)" :width="14" class="memory-section-card__icon" :title="getCategoryDescription(section.category)" />
      <span class="memory-section-card__title">{{ getCategoryLabel(section.category) }}</span>
      <Icon :icon="expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'" :width="14" class="memory-section-card__chevron" />
    </div>
    <div v-if="expanded" class="memory-section-card__list">
      <div v-for="(item, index) in section.items" :key="index" class="memory-section-card__item">
        <span class="memory-section-card__text">{{ item.content }} </span>
        <BButton type="text" size="small" icon="lucide:trash-2" square @click.stop="emit('delete', index)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 记忆分区卡片组件逻辑
 */
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import type { MemoryCategory, MemorySection } from '@/ai/memory/types';

/**
 * 组件 props
 */
interface Props {
  /** 分区数据 */
  section: MemorySection;
}

defineProps<Props>();

/**
 * 组件事件
 */
interface Emits {
  /** 删除条目事件 */
  (e: 'delete', index: number): void;
}

const emit = defineEmits<Emits>();

/** 展开/折叠状态，默认展开 */
const expanded = ref(true);

/** 分区中文标签映射 */
const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  Instructions: '规则',
  Preferences: '偏好',
  Habits: '习惯',
  Facts: '事实',
  Projects: '项目',
  'Current Context': '近期事项'
};

/** 分区描述映射 */
const CATEGORY_DESCRIPTIONS: Record<MemoryCategory, string> = {
  Instructions: '长期规则，如编码规范、约束条件',
  Preferences: '输出偏好，如语言、代码风格',
  Habits: '工作习惯，如常用工具、流程偏好',
  Facts: '长期事实，如你告诉 AI 的个人信息',
  Projects: '长期项目，如正在开发的功能或系统',
  'Current Context': '近期事项，如当前正在进行的任务'
};

/** 分区图标映射 */
const CATEGORY_ICONS: Record<MemoryCategory, string> = {
  Instructions: 'lucide:shield-check',
  Preferences: 'lucide:sliders-horizontal',
  Habits: 'lucide:repeat',
  Facts: 'lucide:info',
  Projects: 'lucide:folder-kanban',
  'Current Context': 'lucide:clock'
};

/**
 * 切换展开/折叠
 */
function toggleExpanded(): void {
  expanded.value = !expanded.value;
}

/**
 * 获取分区中文标签
 * @param category - 分区名称
 * @returns 中文标签
 */
function getCategoryLabel(category: MemoryCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * 获取分区图标
 * @param category - 分区名称
 * @returns 图标名称
 */
function getCategoryIcon(category: MemoryCategory): string {
  return CATEGORY_ICONS[category] ?? 'lucide:circle';
}

/**
 * 获取分区描述
 * @param category - 分区名称
 * @returns 描述文本
 */
function getCategoryDescription(category: MemoryCategory): string {
  return CATEGORY_DESCRIPTIONS[category] ?? '';
}
</script>

<style scoped lang="less">
.memory-section-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
}

.memory-section-card__header {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.8;
  }
}

.memory-section-card__chevron {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.memory-section-card__icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.memory-section-card__title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.memory-section-card__list {
  margin: 0 8px 12px 14px;
  list-style: none;
}

.memory-section-card__item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
  border-top: 1px solid var(--border-tertiary);

  &:first-child {
    border-top: none;
  }

  & + & {
    margin-top: 8px;
  }

  &:hover {
    button {
      opacity: 1;
    }
  }

  button {
    opacity: 0;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
}

.memory-section-card__text {
  flex: 1;
  min-width: 0;
  margin: 5px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
