<!--
  @file ContextUsage.vue
  @description 在输入工具栏中展示当前模型上下文窗口的环形使用量与悬浮说明。
-->
<template>
  <Tooltip :title="tooltipText" placement="top" :arrow="false" overlay-class-name="context-usage-tooltip">
    <button class="context-usage" type="button" :aria-label="tooltipText">
      <svg class="context-usage__ring" viewBox="0 0 36 36" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <circle class="context-usage__track" cx="18" cy="18" r="14"></circle>
        <circle
          v-if="usagePercent > 0"
          class="context-usage__progress"
          cx="18"
          cy="18"
          r="14"
          pathLength="100"
          :stroke-dasharray="`${usagePercent} 100`"
        ></circle>
      </svg>
    </button>
  </Tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Tooltip } from 'ant-design-vue';

/**
 * 上下文用量入口属性。
 */
interface Props {
  /** 当前模型输入投影估算 Token 数。 */
  usedTokens: number;
  /** 当前模型最大上下文窗口 Token 数。 */
  contextWindow: number;
}

const props = withDefaults(defineProps<Props>(), {
  usedTokens: 0,
  contextWindow: 200_000
});

/**
 * 将外部 Token 值归一化为非负整数。
 * @param value - 待归一化数值
 * @returns 可安全展示的 Token 数
 */
function normalizeTokens(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/**
 * 按截图约定将千级 Token 格式化为一位小数 K。
 * @param value - Token 数
 * @returns 紧凑 Token 文本
 */
function formatTokens(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

/** 限制到有效范围的已使用 Token 数。 */
const safeUsedTokens = computed<number>(() => normalizeTokens(props.usedTokens));

/** 限制到有效范围的模型上下文窗口。 */
const safeContextWindow = computed<number>(() => Math.max(1, normalizeTokens(props.contextWindow)));

/** 环形图展示的上下文使用百分比。 */
const usagePercent = computed<number>(() => {
  return Math.min(100, Math.max(0, (safeUsedTokens.value / safeContextWindow.value) * 100));
});

/** 悬浮时展示的完整上下文用量说明。 */
const tooltipText = computed<string>(() => {
  return `${usagePercent.value.toFixed(1)}% · ${formatTokens(safeUsedTokens.value)} / ${formatTokens(safeContextWindow.value)} 上下文已使用`;
});
</script>

<style scoped lang="less">
.context-usage {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-secondary);
  cursor: default;
  background: transparent;
  border: 0;
  border-radius: 50%;
  transition: color 0.15s ease, background-color 0.15s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.context-usage__ring {
  display: block;
  width: 16px;
  height: 16px;
}

.context-usage__track,
.context-usage__progress {
  fill: none;
  stroke-width: 5;
}

.context-usage__track {
  stroke: var(--border-primary);
}

.context-usage__progress {
  stroke: var(--color-primary);
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 18px 18px;
  transition: stroke-dasharray 0.25s ease;
}

:global(.context-usage-tooltip) {
  max-width: none;
}

:global(.context-usage-tooltip .ant-tooltip-inner) {
  white-space: nowrap;
}
</style>
