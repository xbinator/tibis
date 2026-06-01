<!--
  @file SkillDetail.vue
  @description Skill 只读详情面板，展示 Skill 元信息、目录文件树与文件内容预览
-->
<template>
  <BSettingsPage title="Skill 详情" class="skill-detail">
    <template #title>
      <div v-if="skill" class="skill-detail__title">
        <div class="skill-detail__icon">{{ initial }}</div>
        <div class="skill-detail__name">
          <div class="skill-detail__name-text">{{ skill.name }}</div>
          <span class="skill-detail__tag">{{ skill.enabled ? '已启用' : '已禁用' }}</span>
        </div>
      </div>
    </template>

    <template #extra>
      <BButton type="text" square title="关闭详情" data-test="skill-detail-close" @click="emit('close')">
        <Icon icon="lucide:x" :width="16" />
      </BButton>
    </template>

    <template v-if="skill">
      <header class="skill-detail__header">
        <div class="skill-detail__meta">
          <div class="skill-detail__desc">{{ skill.description }}</div>
        </div>
      </header>

      <div v-if="skill.parseError" class="skill-detail__parse-error">
        <Icon icon="lucide:alert-triangle" :width="14" />
        <span>{{ skill.parseError }}</span>
      </div>

      <div class="skill-detail__path">
        <span class="skill-detail__path-text">{{ skill.dirPath }}</span>
        <BButton type="text" square size="small" title="复制路径" @click="handleCopyPath">
          <Icon icon="lucide:copy" :width="12" />
        </BButton>
      </div>

      <SkillPreview :root-path="skill?.dirPath" :initial-file-path="skill?.filePath" />
    </template>
  </BSettingsPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { SkillDefinition } from '@/ai/skill/types';
import { useClipboard } from '@/hooks/useClipboard';
import SkillPreview from './SkillPreview.vue';

const { clipboard } = useClipboard();

interface Props {
  /** 当前查看的 Skill */
  skill: SkillDefinition | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /**
   * 请求关闭详情面板
   * @param event - 事件名
   */
  (event: 'close'): void;
}>();

/** Skill 名称首字母大写，用于图标展示 */
const initial = computed<string>(() => props.skill?.name.charAt(0).toUpperCase() ?? 'S');

/** 复制目录路径 */
function handleCopyPath(): void {
  if (props.skill?.dirPath) {
    clipboard(props.skill.dirPath, { successMessage: '路径已复制' });
  }
}
</script>

<style scoped lang="less">
.skill-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  user-select: text;
}

/* 覆盖 BSettingsPage body 默认样式，使内容区作为 flex 容器并禁止自身滚动 */
.skill-detail :deep(.b-settings-page__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
}

.skill-detail__title {
  display: flex;
  gap: 8px;
  align-items: center;
}

.skill-detail__header {
  display: flex;
  align-items: flex-start;
}

.skill-detail__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.skill-detail__meta {
  min-width: 0;
}

.skill-detail__name {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.skill-detail__name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-detail__desc {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.skill-detail__tag {
  flex-shrink: 0;
  padding: 2px 6px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-tertiary);
  border-radius: 4px;
}

.skill-detail__parse-error {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--color-danger, #ff4d4f);
  background: var(--color-danger-bg, #fff2f0);
  border-radius: 6px;
}

.skill-detail__path {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 4px 4px 4px 8px;
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border-tertiary);
  border-radius: 6px;
}

.skill-detail__path-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
</style>
