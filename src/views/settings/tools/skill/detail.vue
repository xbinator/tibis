<!--
  @file detail.vue
  @description Skill 详情独立页面，从路由参数获取 skill 名称并展示详情。
-->
<template>
  <BSettingsPage title="Skill 详情" class="skill-detail">
    <template #title>
      <div class="skill-detail__title-row">
        <BButton type="text" square size="small" title="返回列表" @click="handleGoBack">
          <Icon icon="lucide:arrow-left" :width="16" />
        </BButton>
        <div v-if="skill" class="skill-detail__title">
          <div class="skill-detail__name">
            <div class="skill-detail__name-text">{{ skill.name }}</div>
          </div>
        </div>
      </div>
    </template>

    <template #extra>
      <ASwitch v-if="skill" :checked="skill.enabled" :disabled="!!skill.parseError" @change="handleToggle" />
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

      <SkillPreview :root-path="skill.dirPath" :initial-file-path="skill.filePath" />
    </template>

    <div v-else class="skill-detail__empty">
      <Icon icon="lucide:search-x" :width="24" />
      <span>未找到该技能</span>
    </div>
  </BSettingsPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useClipboard } from '@/hooks/useClipboard';
import { useSkillStore } from '@/stores/ai/skill';
import SkillPreview from './components/SkillPreview.vue';

const route = useRoute();
const router = useRouter();
const store = useSkillStore();
const { clipboard } = useClipboard();

/** 从路由参数获取 skill 名称。 */
const skillName = computed(() => decodeURIComponent(route.params.name as string));

/** 当前查看的 Skill 对象。 */
const skill = computed(() => store.getSkillByName(skillName.value) ?? null);

/** 切换 Skill 启用状态。 */
function handleToggle(): void {
  if (skill.value) {
    store.toggleSkill(skill.value.name);
  }
}

/** 复制目录路径。 */
function handleCopyPath(): void {
  if (skill.value?.dirPath) {
    clipboard(skill.value.dirPath, { successMessage: '路径已复制' });
  }
}

/** 返回技能列表页。 */
function handleGoBack(): void {
  router.push({ name: 'skill-list' });
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

.skill-detail :deep(.b-settings-page__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
}

.skill-detail__title-row {
  display: flex;
  gap: 6px;
  align-items: center;
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

.skill-detail__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>
