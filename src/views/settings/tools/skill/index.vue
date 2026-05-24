<!--
  @file index.vue
  @description Skill 设置页，管理搜索路径、查看和启用/禁用 Skill。
-->
<template>
  <div class="skill-settings">
    <BSettingsPage class="skill-settings__page" title="技能">
      <!-- 搜索路径说明 -->
      <BSettingsSection title="搜索路径" content-class="skill-settings__content">
        <div class="skill-settings__hint">Skill 文件放置在 <code>.agents/skills/&lt;name&gt;/SKILL.md</code> 目录下即可自动发现</div>
      </BSettingsSection>

      <!-- Skill 列表 -->
      <BSettingsSection title="全局">
        <div v-if="store.skills.length === 0" class="skill-settings__empty">
          {{ store.initialized ? '未发现任何 Skill' : '正在扫描…' }}
        </div>

        <div
          v-for="skill in pagedSkills"
          :key="skill.filePath"
          class="skill-settings__item"
          :class="{
            'skill-settings__item--error': skill.parseError,
            'skill-settings__item--active': selectedSkill?.filePath === skill.filePath
          }"
        >
          <SkillItemRow :skill="skill" @toggle="store.toggleSkill" @open="handleOpenSkill" />
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

    <!-- SkillDetail -->
    <BPanelSplitter
      v-if="detailVisible"
      v-model:size="detailPanelWidth"
      position="left"
      :min-width="300"
      :max-width="800"
      section-class="skill-settings__detail-wrapper"
      @close="handleCloseSkillDetail"
    >
      <SkillDetail :skill="selectedSkill" @close="handleCloseSkillDetail" />
    </BPanelSplitter>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useSkillStore } from '@/stores/ai/skill';
import SkillDetail from './components/SkillDetail.vue';
import SkillItemRow from './components/SkillItemRow.vue';

/** 每页显示数量。 */
const PAGE_SIZE = 5;

const store = useSkillStore();
const currentPage = ref(1);
const selectedSkillName = ref('');
const detailVisible = ref(false);
/** 详情面板默认宽度。 */
const DEFAULT_DETAIL_PANEL_WIDTH = 480;

const detailPanelWidth = ref(DEFAULT_DETAIL_PANEL_WIDTH);

/** 当前页的 skill 列表。 */
const pagedSkills = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return store.skills.slice(start, start + PAGE_SIZE);
});

/** 当前详情面板展示的 Skill，仅手动选择时才展示。 */
const selectedSkill = computed(() => {
  if (!selectedSkillName.value) return null;

  return store.getSkillByName(selectedSkillName.value) ?? null;
});

/**
 * 打开 Skill 只读详情面板。
 * @param name - Skill 名称
 */
function handleOpenSkill(name: string): void {
  selectedSkillName.value = name;

  detailVisible.value = true;
}

/**
 * 关闭 Skill 只读详情面板。
 */
function handleCloseSkillDetail(): void {
  detailVisible.value = false;

  selectedSkillName.value = '';

  detailPanelWidth.value = detailPanelWidth.value || DEFAULT_DETAIL_PANEL_WIDTH;
}
</script>

<style scoped lang="less">
.skill-settings {
  display: flex;
  gap: 6px;
  height: 100%;
  min-height: 0;
}

.skill-settings__page {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.skill-settings__detail-wrapper {
  min-height: 0;
}

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

  &--active {
    background: var(--bg-secondary);
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

@media (width <= 960px) {
  .skill-settings {
    grid-template-columns: 1fr;
  }
}
</style>
