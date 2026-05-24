<!--
  @file SkillItemRow.vue
  @description Skill 列表项行组件，展示单个 Skill 的图标、名称、描述及启用开关。
-->
<template>
  <div class="skill-settings__item-row" role="button" tabindex="0" @click="handleOpen" @keydown.enter.prevent="handleOpen" @keydown.space.prevent="handleOpen">
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
    <div class="skill-settings__item-actions">
      <ASwitch :checked="skill.enabled" size="small" :disabled="!!skill.parseError" @click.stop @change="handleToggle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { SkillDefinition } from '@/ai/skill/types';

/**
 * Skill 列表项行组件
 * @props skill - Skill 定义对象
 * @emits toggle - 切换启用状态时触发，参数为 skill name
 */
const props = defineProps<{
  /** Skill 定义对象 */
  skill: SkillDefinition;
}>();

const emit = defineEmits<{
  /** 切换 Skill 启用状态 */
  (e: 'toggle', name: string): void;
  /** 打开 Skill 只读详情 */
  (e: 'open', name: string): void;
}>();

/** Skill 名称首字母大写，用于图标展示。 */
const initial = computed(() => props.skill.name.charAt(0).toUpperCase());

/** 展示用描述，移除开头的双引号。 */
const description = computed(() => {
  const desc = props.skill.description;
  return desc.startsWith('"') ? desc.slice(1) : desc;
});

/**
 * 打开 Skill 只读详情。
 */
function handleOpen(): void {
  emit('open', props.skill.name);
}

/**
 * 切换 Skill 启用状态。
 */
function handleToggle(): void {
  emit('toggle', props.skill.name);
}
</script>

<style scoped lang="less">
.skill-settings__item-row {
  display: flex;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  outline: none;

  &:focus-visible {
    border-radius: 6px;
    box-shadow: 0 0 0 2px var(--color-primary-bg, rgb(22 119 255 / 14%));
  }
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
}

.skill-settings__item-parse-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-danger, #ff4d4f);
}

.skill-settings__item-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}
</style>
