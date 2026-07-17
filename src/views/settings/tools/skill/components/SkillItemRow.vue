<!--
  @file SkillItemRow.vue
  @description Skill 列表项行组件，展示单个 Skill 的图标、名称、描述及启用开关。
-->
<template>
  <div class="skill-settings__item-row" role="button" tabindex="0" @click="handleOpen">
    <div class="skill-settings__item-icon">{{ initial }}</div>
    <div class="skill-settings__item-info">
      <div class="skill-settings__item-name">
        {{ skill.name }}
        <span v-if="skill.parseError" class="skill-settings__item-error-badge" :title="skill.parseError">
          <Icon icon="lucide:alert-triangle" :width="12" />
        </span>
      </div>
      <div class="skill-settings__desc">{{ description }}</div>
      <!-- 解析错误详情 -->
      <div v-if="skill.parseError" class="skill-settings__item-parse-error">{{ skill.parseError }}</div>
    </div>
    <div class="skill-settings__item-actions" @click.stop>
      <ASwitch :checked="skill.enabled" size="small" :disabled="!!skill.parseError" @change="handleToggle" />
      <BDropdown placement="bottomRight" :disabled="deleting">
        <BButton type="ghost" size="small" square icon="lucide:settings" title="技能设置" aria-label="技能设置" :disabled="deleting" />
        <template #overlay>
          <BDropdownMenu :options="dropdownOptions" :width="120" />
        </template>
      </BDropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { message } from 'ant-design-vue';
import type { SkillDefinition } from '@/ai/skill/types';
import type { DropdownOption } from '@/components/BDropdown/type';
import { useNavigate } from '@/hooks/useNavigate';
import { useOpenFile } from '@/hooks/useOpenFile';
import { native } from '@/shared/platform';
import { useSkillStore } from '@/stores/ai/skill';
import logger from '@/utils/logger';
import { Modal } from '@/utils/modal';

/**
 * Skill 列表项属性。
 */
interface Props {
  /** Skill 定义对象 */
  skill: SkillDefinition;
}

const props = defineProps<Props>();
const store = useSkillStore();
const { openSkill } = useNavigate();
const { openFileByPath } = useOpenFile();
/** 当前 Skill 是否正在执行删除流程。 */
const deleting = ref(false);

/** Skill 名称首字母大写，用于图标展示。 */
const initial = computed(() => props.skill.name.charAt(0).toUpperCase());

/** 展示用描述，移除开头的双引号。 */
const description = computed<string>(() => {
  const desc = props.skill.description;
  return desc.startsWith('"') ? desc.slice(1) : desc;
});

/**
 * 打开 Skill 独立详情页。
 */
function handleOpen(): void {
  openSkill(props.skill.name);
}

/**
 * 切换 Skill 启用状态。
 */
function handleToggle(): void {
  store.toggleSkill(props.skill.name);
}

/**
 * 在 Markdown 编辑器中打开当前 Skill 的入口文件。
 */
async function handleEditSkill(): Promise<void> {
  if (deleting.value) {
    return;
  }

  try {
    const openedFile = await openFileByPath(props.skill.filePath);

    if (!openedFile) {
      message.error(`无法打开技能 "${props.skill.name}" 的 SKILL.md`);
    }
  } catch (error: unknown) {
    logger.error('Open SKILL.md failed:', error);
    const reason = error instanceof Error ? error.message : String(error);
    message.error(`无法打开技能 "${props.skill.name}" 的 SKILL.md：${reason}`);
  }
}

/**
 * 将当前 Skill 的整个资源目录移入系统回收站，并刷新 Store。
 */
async function handleDeleteSkill(): Promise<void> {
  if (deleting.value) {
    return;
  }

  // 删除锁覆盖确认弹窗和文件操作，避免快速重复点击生成多个确认流程。
  deleting.value = true;
  let movedToTrash = false;
  try {
    const [, confirmed] = await Modal.delete(`确定要删除技能 "${props.skill.name}" 吗？整个目录及其中的附属文件都会移入系统回收站。`);

    if (!confirmed) {
      return;
    }

    await native.trashFile(props.skill.dirPath);
    movedToTrash = true;
    await store.rescan();
    message.success(`技能 "${props.skill.name}" 已删除`);
  } catch (error: unknown) {
    // 目录已移入回收站时只提示刷新失败，避免误导用户重复删除。
    if (movedToTrash) {
      logger.warn('Refresh skills after deletion failed:', error);
      message.warning(`技能 "${props.skill.name}" 已移入回收站，但列表刷新失败`);
    } else {
      logger.error('Delete Skill failed:', error);
      const reason = error instanceof Error ? error.message : String(error);
      message.error(`删除技能 "${props.skill.name}" 失败：${reason}`);
    }
  } finally {
    deleting.value = false;
  }
}

/** Skill 设置菜单。 */
const dropdownOptions = computed<DropdownOption[]>(() => [
  {
    type: 'item',
    value: 'edit',
    label: '编辑',
    disabled: deleting.value,
    onClick: handleEditSkill
  },
  { type: 'divider' },
  {
    type: 'item',
    value: 'delete',
    label: '删除',
    danger: true,
    disabled: deleting.value,
    onClick: handleDeleteSkill
  }
]);
</script>

<style scoped lang="less">
.skill-settings__item-row {
  display: flex;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  outline: none;
}

.skill-settings__item-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.skill-settings__item-info {
  flex: 1;
  min-width: 0;
}

.skill-settings__item-name {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  user-select: text;
}

.skill-settings__item-error-badge {
  display: inline-flex;
  align-items: center;
  color: var(--color-warning, #faad14);
}

.skill-settings__desc {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  user-select: text;
}

.skill-settings__item-parse-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-danger, #ff4d4f);
  user-select: text;
}

.skill-settings__item-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
}
</style>
