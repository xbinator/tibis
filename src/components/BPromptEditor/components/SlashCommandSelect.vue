<template>
  <div v-if="visible && commands.length" class="slash-command-menu" :style="menuStyle" data-testid="slash-command-menu" @mousedown.prevent>
    <div class="slash-command-menu__list">
      <div
        v-for="(command, index) in commands"
        :key="command.id"
        class="slash-command-menu__item"
        :class="{ active: activeIndex === index }"
        data-testid="slash-command-item"
        @click="handleSelect(command)"
        @mouseenter="handleMouseEnter(index)"
      >
        <div class="slash-command-menu__item-trigger">{{ command.trigger }}</div>
        <div class="slash-command-menu__item-desc">{{ command.description }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SlashCommandOption } from '../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';

/**
 * Slash 命令菜单属性。
 */
interface Props {
  /** 是否显示菜单。 */
  visible: boolean;
  /** 可选命令列表。 */
  commands: readonly SlashCommandOption[];
  /** 当前高亮项索引。 */
  activeIndex?: number;
}

withDefaults(defineProps<Props>(), {
  activeIndex: 0
});

const emit = defineEmits<{
  (e: 'select', command: SlashCommandOption): void;
  (e: 'update:activeIndex', index: number): void;
}>();

/**
 * 菜单样式，固定贴在输入框外部上方并跟随容器宽度。
 */
const menuStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: '0px',
  width: '100%',
  zIndex: 10
}));

/**
 * 选择指定 Slash 命令。
 * @param command - 被点击的命令项。
 */
function handleSelect(command: SlashCommandOption): void {
  emit('select', command);
}

/**
 * 更新当前高亮索引。
 * @param index - 鼠标悬停到的新索引。
 */
function handleMouseEnter(index: number): void {
  emit('update:activeIndex', index);
}
</script>

<style scoped>
.slash-command-menu {
  min-width: 0;
  max-height: 320px;
  overflow: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgb(0 0 0 / 8%), 0 3px 6px -4px rgb(0 0 0 / 12%), 0 9px 28px 8px rgb(0 0 0 / 5%);
}

.slash-command-menu__list {
  max-height: 280px;
  overflow-y: auto;
}

.slash-command-menu__item {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.slash-command-menu__item:hover,
.slash-command-menu__item.active {
  background: var(--bg-secondary);
}

.slash-command-menu__item-trigger {
  padding: 2px 6px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-bg);
  border-radius: 4px;
}

.slash-command-menu__item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.slash-command-menu__item-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
