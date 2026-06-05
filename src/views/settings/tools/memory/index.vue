<!--
  @file index.vue
  @description 记忆设置页，管理记忆开关、查看记忆内容、编辑记忆。
-->
<template>
  <BSettingsPage :title="MENU_ITEMS.memory.label">
    <BSettingsSection title="功能开关">
      <div class="memory-settings__item">
        <div class="memory-settings__meta">
          <div class="memory-settings__label">启用记忆</div>
          <div class="memory-settings__description">允许从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应</div>
        </div>
        <div>
          <ASwitch :checked="settingStore.memoryEnabled" @change="handleToggleEnabled" />
        </div>
      </div>
    </BSettingsSection>

    <BSettingsSection title="记忆内容">
      <template #extra>
        <BButton size="small" icon="lucide:pencil" @click="startEdit">编辑</BButton>
      </template>

      <div v-if="memoryStore.isEmpty" class="memory-settings__empty">
        <p>暂无记忆条目</p>
        <p class="memory-settings__empty-hint">随着对话积累，自动学习你的偏好和习惯</p>
      </div>

      <MemoryContent v-if="!memoryStore.isEmpty" :content="memoryStore.rawContent" />

      <MemoryInput v-model:open="editing" />
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description 记忆设置页，管理记忆开关、查看记忆内容、编辑记忆。
 */
import { ref } from 'vue';
import { useMemoryStore } from '@/stores/ai/memory';
import { useSettingStore } from '@/stores/ui/setting';
import { MENU_ITEMS } from '@/views/settings/constants';
import MemoryContent from './components/MemoryContent.vue';
import MemoryInput from './components/MemoryInput.vue';

const memoryStore = useMemoryStore();
const settingStore = useSettingStore();

/** 是否处于编辑模式 */
const editing = ref(false);

/**
 * 切换记忆功能开关
 * @param value - 开关状态
 */
function handleToggleEnabled(value: boolean | string | number): void {
  settingStore.memoryEnabled = Boolean(value);
  settingStore.persistSettings();
}

/**
 * 进入编辑模式，打开弹窗
 */
function startEdit(): void {
  editing.value = true;
}
</script>

<style scoped lang="less">
.memory-settings__item {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 16px;
  transition: background 0.2s ease;

  &:hover,
  &:focus-within {
    background: var(--bg-hover);
  }
}

.memory-settings__meta {
  flex: 1;
  min-width: 0;
}

.memory-settings__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  user-select: none;
}

.memory-settings__description {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.memory-settings__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 32px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

.memory-settings__empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

@media (width <= 800px) {
  .memory-settings__item {
    padding: 0 12px;
  }
}
</style>
