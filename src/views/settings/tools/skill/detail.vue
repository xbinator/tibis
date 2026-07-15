<!--
  @file detail.vue
  @description Skill 详情独立页面，按目录 ID 从 Store 懒加载并展示缓存内容。
-->
<template>
  <SettingsPage title="Skill 详情" class="skill-detail">
    <template #title>
      <div class="skill-detail__title-row">
        <BButton type="text" square size="small" title="返回列表" @click="handleGoBack">
          <Icon icon="lucide:arrow-left" :width="16" />
        </BButton>
        <div v-if="skill" class="skill-detail__title">
          <div class="skill-detail__name">
            <div class="skill-detail__name-text">{{ skillName }}</div>
          </div>
        </div>
      </div>
    </template>

    <template #extra>
      <ASwitch v-if="skill" :checked="skill.enabled" :disabled="!!parseError" @change="handleToggle" />
    </template>

    <template v-if="skill">
      <header class="skill-detail__header">
        <div class="skill-detail__meta">
          <div class="skill-detail__desc">{{ skillDescription }}</div>
        </div>
      </header>

      <div v-if="parseError" class="skill-detail__parse-error">
        <Icon icon="lucide:alert-triangle" :width="14" />
        <span>{{ parseError }}</span>
      </div>

      <div v-else-if="skill.loadError" class="skill-detail__parse-error">
        <Icon icon="lucide:alert-triangle" :width="14" />
        <span>{{ skill.loadError }}</span>
      </div>

      <div class="skill-detail__path">
        <span class="skill-detail__path-text">{{ skill.dirPath }}</span>
        <BButton type="text" square size="small" title="复制路径" @click="handleCopyPath">
          <Icon icon="lucide:copy" :width="12" />
        </BButton>
      </div>

      <SkillPreview
        v-if="skill.sourceContent !== undefined"
        :root-path="skill.dirPath"
        :initial-file-path="skill.filePath"
        :initial-content="skill.sourceContent"
      />
      <div v-else-if="!skill.loadError" class="skill-detail__empty">
        <span>正在加载技能内容…</span>
      </div>
    </template>

    <div v-else class="skill-detail__empty">
      <Icon icon="lucide:search-x" :width="24" />
      <span>未找到该技能</span>
    </div>
  </SettingsPage>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { SkillEntry } from '@/ai/skill';
import { useClipboard } from '@/hooks/useClipboard';
import { useSkillStore } from '@/stores/ai/skill';
import SettingsPage from '@/views/settings/_components/SettingsPage.vue';
import SkillPreview from './components/SkillPreview.vue';

const route = useRoute();
const router = useRouter();
const store = useSkillStore();
const { clipboard } = useClipboard();

/** 当前详情条目。 */
const skill = ref<SkillEntry | null>(null);
/** 异步路由加载版本，用于丢弃迟到结果。 */
let loadVersion = 0;

/** 从路由参数读取 Skill 目录 ID。 */
const skillId = computed<string>((): string => {
  const value = route.params.id;
  return decodeURIComponent(Array.isArray(value) ? value[0] ?? '' : String(value ?? ''));
});

/** Skill 展示名称，内容未加载时回退到目录 ID。 */
const skillName = computed<string>((): string => skill.value?.definition?.name || skill.value?.id || '');

/** Skill 展示描述，读取失败时展示错误。 */
const skillDescription = computed<string>((): string => {
  return skill.value?.definition?.description || skill.value?.loadError || '未加载技能描述';
});

/** 当前 Skill 解析错误。 */
const parseError = computed<string>((): string => skill.value?.definition?.parseError || '');

/**
 * 按目录 ID 从 Store 获取 Skill 内容。
 * @param id - Skill 目录 ID
 */
async function loadSkill(id: string): Promise<void> {
  const version = ++loadVersion;
  await store.waitForInit();
  if (version !== loadVersion) {
    return;
  }

  skill.value = id ? store.getSkillById(id) ?? null : null;
  if (!id || !skill.value) {
    return;
  }

  const loaded = await store.getSkill(id);
  if (version === loadVersion) {
    skill.value = loaded ?? store.getSkillById(id) ?? null;
  }
}

/** 切换 Skill 启用状态。 */
function handleToggle(): void {
  if (skill.value) {
    store.toggleSkill(skill.value.id);
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

/** 路由目录 ID 变化时重新获取对应 Store 条目。 */
watch(
  skillId,
  async (id: string): Promise<void> => {
    await loadSkill(id);
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
.skill-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  user-select: text;
}

.skill-detail :deep(.settings-page__body) {
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
