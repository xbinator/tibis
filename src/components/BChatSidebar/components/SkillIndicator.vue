<!--
  @file SkillIndicator.vue
  @description 聊天侧边栏 Skill 提示组件，当 LLM 调用 skill 工具后显示标签提示。
-->
<template>
  <div v-if="activeSkills.length > 0" class="skill-indicator">
    <ATooltip v-for="skill in activeSkills" :key="skill.name" placement="top">
      <template #title>{{ skill.description }}</template>
      <span class="skill-indicator__tag">
        <Icon icon="lucide:zap" :width="10" />
        {{ skill.name }}
        <Icon icon="lucide:x" :width="10" class="skill-indicator__close" @click="handleClose(skill.name)" />
      </span>
    </ATooltip>
  </div>
</template>

<script setup lang="ts">
/**
 * @description SkillIndicator 组件，监听聊天消息中的 skill 工具调用，显示已激活的 skill 标签。
 */
import type { Message } from '../utils/types';
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { SKILL_TOOL_NAME } from '@/ai/tools/builtin/SkillTool';
import { useSkillStore } from '@/stores/ai/skill';

/**
 * 已激活的 skill 信息。
 */
interface ActiveSkill {
  /** skill 名称 */
  name: string;
  /** skill 描述 */
  description: string;
}

const props = defineProps<{
  /** 当前聊天消息列表 */
  messages: Message[];
}>();

const skillStore = useSkillStore();

/** 用户手动关闭的 skill 名称集合。 */
const dismissedNames = ref(new Set<string>());

/**
 * 从消息中提取所有 skill 工具调用的名称（去重）。
 */
const calledSkillNames = computed(() => {
  const names = new Set<string>();
  for (const msg of props.messages) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.parts) {
      if (part.type === 'tool-call' && part.toolName === SKILL_TOOL_NAME) {
        const input = part.input as { name?: string } | null;
        if (input?.name) {
          names.add(input.name);
        }
      }
    }
  }
  return names;
});

/**
 * 当前激活的 skill 列表（未被用户关闭的）。
 */
const activeSkills = computed<ActiveSkill[]>(() => {
  const result: ActiveSkill[] = [];
  for (const name of calledSkillNames.value) {
    if (dismissedNames.value.has(name)) continue;
    const skill = skillStore.getSkillByName(name);
    result.push({
      name,
      description: skill?.description ?? ''
    });
  }
  return result;
});

/**
 * 关闭指定 skill 的标签提示。
 * @param name - skill 名称
 */
function handleClose(name: string): void {
  dismissedNames.value.add(name);
}

/**
 * 当消息列表变化时，清理不再存在的 dismissed 名称。
 */
watch(calledSkillNames, (current) => {
  for (const name of dismissedNames.value) {
    if (!current.has(name)) {
      dismissedNames.value.delete(name);
    }
  }
});
</script>

<style scoped lang="less">
.skill-indicator {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 4px 0;
}

.skill-indicator__tag {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--color-primary);
  cursor: pointer;
  background: var(--color-primary-bg);
  border-radius: 10px;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.8;
  }
}

.skill-indicator__close {
  opacity: 0.5;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
}
</style>
