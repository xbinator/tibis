<!--
  @file SectionCard.vue
  @description 记忆分区卡片组件，支持折叠展开、条目编辑和删除。
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
        <!-- 编辑模式 -->
        <div v-if="editingIndex === index" class="memory-section-card__edit">
          <AInput
            v-focus
            :value="editValue"
            size="small"
            class="memory-section-card__input"
            @update:value="handleEditInput"
            @keydown.enter="handleEditConfirm(index)"
            @keydown.escape="handleEditCancel"
            @blur="handleEditConfirm(index)"
          />
        </div>
        <!-- 展示模式 -->
        <template v-else>
          <span class="memory-section-card__text" @dblclick="handleStartEdit(index, item.content)">{{ item.content }}</span>
          <div class="memory-section-card__actions">
            <BButton type="text" size="small" icon="lucide:pencil" square @click.stop="handleStartEdit(index, item.content)" />
            <BButton type="text" size="small" icon="lucide:trash-2" square @click.stop="emit('delete', index)" />
          </div>
        </template>
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
import { vFocus } from '@/directives/focus';

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
  /** 更新条目内容事件 */
  (e: 'update', index: number, content: string): void;
}

const emit = defineEmits<Emits>();

/** 展开/折叠状态，默认展开 */
const expanded = ref(true);

/** 当前正在编辑的条目索引，-1 表示不在编辑 */
const editingIndex = ref(-1);

/** 编辑中的内容值 */
const editValue = ref('');

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

/**
 * 进入编辑模式
 * @param index - 条目索引
 * @param content - 当前内容
 */
function handleStartEdit(index: number, content: string): void {
  editingIndex.value = index;
  editValue.value = content;
}

/**
 * 处理编辑输入
 * @param value - 输入值
 */
function handleEditInput(value: string): void {
  editValue.value = value;
}

/**
 * 确认编辑，保存修改
 * @param index - 条目索引
 */
function handleEditConfirm(index: number): void {
  const trimmed = editValue.value.trim();
  if (trimmed.length > 0 && editingIndex.value !== -1) {
    emit('update', index, trimmed);
  }
  editingIndex.value = -1;
  editValue.value = '';
}

/**
 * 取消编辑
 */
function handleEditCancel(): void {
  editingIndex.value = -1;
  editValue.value = '';
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
  border-top: 1px solid var(--border-tertiary);

  &:first-child {
    border-top: none;
  }

  & + & {
    margin-top: 8px;
  }

  &:hover {
    .memory-section-card__actions {
      opacity: 1;
    }
  }
}

.memory-section-card__actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  align-items: center;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.memory-section-card__text {
  flex: 1;
  min-width: 0;
  margin: 5px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-all;
  cursor: text;
}

.memory-section-card__edit {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
}

.memory-section-card__input {
  :deep(.ant-input) {
    font-size: 12px;
  }
}
</style>
