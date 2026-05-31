<!--
  @file index.vue
  @description 记忆设置页，管理记忆开关、查看记忆条目、删除/清空记忆。
-->
<template>
  <BSettingsPage title="记忆">
    <BSettingsSection title="功能开关">
      <div class="memory-settings__item">
        <div class="memory-settings__meta">
          <div class="memory-settings__label">启用记忆</div>
          <div class="memory-settings__description">允许从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应</div>
        </div>
        <div>
          <ASwitch :checked="memoryStore.enabled" @change="handleToggleEnabled" />
        </div>
      </div>
    </BSettingsSection>

    <BSettingsSection title="记忆概览">
      <div v-if="memoryStore.isEmpty" class="memory-settings__empty">
        <Icon :icon="'lucide:brain'" :width="32" class="memory-settings__empty-icon" />
        <p>暂无记忆条目</p>
        <p class="memory-settings__empty-hint">随着对话积累，Tibis 会自动学习你的偏好和习惯</p>
      </div>
      <template v-else>
        <div class="memory-settings__grid">
          <SectionCard
            v-for="section in memoryStore.nonEmptySections"
            :key="section.category"
            :section="section"
            @delete="(index: number) => handleDeleteItem(section.category, index)"
          />
        </div>
      </template>
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
/**
 * 记忆设置页逻辑
 */
import { Icon } from '@iconify/vue';
import { useMemoryStore } from '@/stores/ai/memory';
import SectionCard from './components/SectionCard.vue';

const memoryStore = useMemoryStore();

/**
 * 切换记忆功能开关
 * @param value - 开关状态
 */
function handleToggleEnabled(value: boolean | string | number): void {
  memoryStore.setEnabled(Boolean(value));
}

/**
 * 删除指定分区的指定条目
 * @param category - 分区名称
 * @param index - 条目索引
 */
async function handleDeleteItem(category: string, index: number): Promise<void> {
  await memoryStore.deleteItem(category, index);
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

.memory-settings__empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.memory-settings__empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.memory-settings__grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 14px;
}

@media (width <= 800px) {
  .memory-settings__item {
    padding: 0 12px;
  }

  .memory-settings__grid {
    padding: 0 8px;
  }
}
</style>
