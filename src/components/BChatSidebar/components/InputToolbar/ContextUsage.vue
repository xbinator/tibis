<!--
  @file ContextUsage.vue
  @description 上下文用量指示器，以环形图展示当前可用输入预算 Token 使用比例，鼠标悬停显示详情。
-->
<template>
  <BDropdown v-model:open="open" placement="topLeft">
    <div class="context-usage__trigger">
      <!-- 放大 viewBox 至 36×36（3倍），渲染更清晰，显示时缩放到 12×12 -->
      <svg
        class="context-usage__ring"
        :class="`context-usage__ring--${currentUsage.status}`"
        viewBox="0 0 36 36"
        width="12"
        height="12"
        xmlns="http://www.w3.org/2000/svg"
      >
        <!-- 背景圆 -->
        <circle cx="18" cy="18" r="14" class="context-usage__ring-bg"></circle>
        <!-- 进度弧：stroke-dasharray 方案，从 12 点钟方向开始 -->
        <circle v-if="arcLength > 0" cx="18" cy="18" r="14" class="context-usage__ring-arc" :stroke-dasharray="`${arcLength} ${circumference}`"></circle>
      </svg>
    </div>

    <template #overlay>
      <div class="context-usage__panel">
        <div class="context-usage__header">
          <span class="context-usage__title">输入预算</span>
          <span class="context-usage__percent">{{ currentUsage.usagePercent }}%</span>
        </div>

        <div class="context-usage__body">
          <div class="context-usage__summary">
            <div class="context-usage__total">
              <div class="context-usage__total-value">{{ formatTokens(currentUsage.usedTokens) }}</div>
              <div class="context-usage__total-label">估算已用</div>
            </div>

            <div class="context-usage__stats">
              <div class="context-usage__stat">
                <span class="context-usage__label">可用输入预算</span>
                <span class="context-usage__value">{{ formatTokens(currentUsage.usableInputTokens) }}</span>
              </div>
              <div class="context-usage__stat">
                <span class="context-usage__label">输出预留</span>
                <span class="context-usage__value">{{ formatTokens(currentUsage.reservedOutputTokens) }}</span>
              </div>
              <div class="context-usage__stat">
                <span class="context-usage__label">剩余输入</span>
                <span class="context-usage__value">{{ formatTokens(currentUsage.remainingInputTokens) }}</span>
              </div>
            </div>
          </div>

          <div class="context-usage__progress">
            <div
              class="context-usage__progress-bar"
              :class="`context-usage__progress-bar--${currentUsage.status}`"
              :style="{ width: currentUsage.usagePercent + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </template>
  </BDropdown>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ContextUsageBudgetSnapshot } from '@/components/BChatSidebar/utils/contextUsageBudget';
import { createContextUsageBudgetSnapshot } from '@/components/BChatSidebar/utils/contextUsageBudget';

/**
 * 上下文用量指示器属性。
 */
interface Props {
  /** 当前上下文可用输入预算快照。 */
  usage?: ContextUsageBudgetSnapshot;
  /** 当前上下文已使用的 Token 数。 */
  usedTokens: number;
  /** 模型最大上下文窗口 Token 数。 */
  contextWindow: number;
}

const props = withDefaults(defineProps<Props>(), {
  usage: undefined,
  usedTokens: 0,
  contextWindow: 200000
});

/** 下拉面板是否展开。 */
const open = ref(false);

/** 圆半径，与 viewBox 内坐标对应。 */
const RADIUS = 14;

/** 圆周长。 */
const circumference = 2 * Math.PI * RADIUS;

/** 当前上下文可用输入预算快照。 */
const currentUsage = computed<ContextUsageBudgetSnapshot>(() => {
  return props.usage ?? createContextUsageBudgetSnapshot(props.usedTokens, props.contextWindow);
});

/**
 * 当前进度对应的弧长。
 * 用于 stroke-dasharray，结合 transform rotate(-90deg) 从 12 点钟开始绘制。
 */
const arcLength = computed<number>(() => {
  return (currentUsage.value.usagePercent / 100) * circumference;
});

/**
 * 格式化 Token 数量用于显示。
 * @param value - Token 数量。
 * @returns 格式化后的字符串。
 */
function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}
</script>

<style lang="less" scoped>
.context-usage__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
}

.context-usage__ring {
  display: block;
  cursor: pointer;

  /* 强制整数像素渲染，避免缩放时的亚像素模糊 */
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}

.context-usage__ring-bg {
  fill: none;
  stroke: var(--bg-disabled);
  stroke-width: 6;
  shape-rendering: geometricPrecision;
}

.context-usage__ring-arc {
  fill: none;
  stroke-width: 6;
  stroke-linecap: round;
  shape-rendering: geometricPrecision;

  /* 从 12 点钟方向（顶部）开始顺时针绘制 */
  transform: rotate(-90deg);
  transform-origin: 18px 18px;
  transition: stroke-dasharray 0.35s ease, stroke 0.3s ease;
}

.context-usage__ring--safe .context-usage__ring-arc {
  stroke: var(--color-success, #10b981);
}

.context-usage__ring--warning .context-usage__ring-arc {
  stroke: var(--color-warning, #f59e0b);
}

.context-usage__ring--danger .context-usage__ring-arc {
  stroke: var(--color-error, #ef4444);
}

/* ───── 面板 ───── */

.context-usage__panel {
  min-width: 232px;
  padding: 8px 12px;
  background: var(--dropdown-bg);
  border-radius: 6px;
  box-shadow: var(--shadow-dropdown);
}

.context-usage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-secondary);
}

.context-usage__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.context-usage__percent {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.context-usage__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.context-usage__summary {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.context-usage__total {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-usage__total-value {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--text-primary);
}

.context-usage__total-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.context-usage__stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.context-usage__stat {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}

.context-usage__label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.context-usage__value {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.context-usage__progress {
  height: 4px;
  overflow: hidden;
  background: var(--bg-disabled);
  border-radius: 2px;
}

.context-usage__progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.35s ease;
}

.context-usage__progress-bar--safe {
  background: var(--color-success, #10b981);
}

.context-usage__progress-bar--warning {
  background: var(--color-warning, #f59e0b);
}

.context-usage__progress-bar--danger {
  background: var(--color-error, #ef4444);
}
</style>
