<!--
  @file index.vue
  @description Skill 设置页，管理搜索路径、查看和启用/禁用 Skill。
-->
<template>
  <BSettingsPage title="技能">
    <template #headerExtra>
      <BButton type="primary" size="small" :disabled="!store.initialized" @click="handleRefresh">刷新</BButton>
    </template>

    <!-- 搜索路径说明 -->
    <BSettingsSection title="搜索路径" content-class="skill-settings__content">
      <div class="skill-settings__hint">Skill 文件放置在 <code>.agents/skills/&lt;name&gt;/SKILL.md</code> 目录下即可自动发现</div>
    </BSettingsSection>

    <!-- Skill 列表 -->
    <BSettingsSection title="全局">
      <div v-if="store.skills.length === 0" class="skill-settings__empty">
        {{ store.initialized ? '未发现任何 Skill' : '正在扫描…' }}
      </div>

      <div v-for="skill in pagedSkills" :key="skill.filePath" class="skill-settings__item" :class="{ 'skill-settings__item--error': skill.parseError }">
        <SkillItemRow :skill="skill" @toggle="store.toggleSkill" />
      </div>

      <!-- 分页 -->
      <div v-if="store.skills.length > PAGE_SIZE" class="skill-settings__pagination">
        <APagination v-model:current="currentPage" :total="store.skills.length" :page-size="PAGE_SIZE">
          <template #itemRender="{ type, originalElement }">
            <BButton v-if="type === 'prev'" square>
              <Icon icon="lucide:chevron-left" :width="16" />
            </BButton>
            <BButton v-else-if="type === 'next'" square>
              <Icon icon="lucide:chevron-right" :width="16" />
            </BButton>
            <component :is="originalElement" v-else />
          </template>
        </APagination>
      </div>
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useSkillStore } from '@/stores/ai/skill';
import SkillItemRow from './components/SkillItemRow.vue';

/** 每页显示数量。 */
const PAGE_SIZE = 5;

const store = useSkillStore();
const currentPage = ref(1);

/** 当前页的 skill 列表。 */
const pagedSkills = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return store.skills.slice(start, start + PAGE_SIZE);
});

/**
 * 刷新 skill 列表（重新扫描）。
 */
function handleRefresh(): void {
  store.rescan();
}
</script>

<style scoped lang="less">
.skill-settings__hint {
  font-size: 12px;
  color: var(--text-secondary);

  code {
    padding: 1px 4px;
    font-size: 11px;
    background: var(--bg-tertiary);
    border-radius: 3px;
  }
}

:deep(.skill-settings__content) {
  padding: 16px 20px;
}

.skill-settings__empty {
  padding: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-settings__item {
  padding: 12px 20px;

  &--error {
    background: var(--color-danger-bg, #fff2f0);
    border-radius: 6px;
  }

  &:not(:first-child) {
    border-top: 1px solid var(--border-tertiary);
  }
}

.skill-settings__pagination {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border-tertiary);

  button {
    color: #fff;
  }
}
</style>
