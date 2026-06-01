<!--
  @file ContextUsageIndicator.vue
  @description 上下文用量指示器，以环形图展示当前上下文 Token 使用比例，鼠标悬停显示详情。
-->
<template>
  <BDropdown v-model:open="open" placement="topLeft">
    <div class="context-usage__trigger">
      <!-- 放大 viewBox 至 36×36（3倍），渲染更清晰，显示时缩放到 12×12 -->
      <svg class="context-usage__ring" viewBox="0 0 36 36" width="12" height="12" xmlns="http://www.w3.org/2000/svg">
        <!-- 背景圆 -->
        <circle cx="18" cy="18" r="14" class="context-usage__ring-bg"></circle>
        <!-- 进度弧：stroke-dasharray 方案，从 12 点钟方向开始 -->
        <circle v-if="arcLength > 0" cx="18" cy="18" r="14" class="context-usage__ring-arc" :stroke-dasharray="`${arcLength} ${circumference}`"></circle>
      </svg>
    </div>

    <template #overlay>
      <div class="context-usage__panel">
        <div class="context-usage__header">
          <span class="context-usage__title">上下文用量</span>
          <span class="context-usage__percent">{{ usagePercent }}%</span>
        </div>

        <div class="context-usage__body">
          <div class="context-usage__summary">
            <div class="context-usage__total">
              <div class="context-usage__total-value">{{ formatTokens(usedTokens) }}</div>
              <div class="context-usage__total-label">已使用</div>
            </div>

            <div class="context-usage__stats">
              <div class="context-usage__stat">
                <span class="context-usage__label">窗口上限</span>
                <span class="context-usage__value">{{ formatTokens(contextWindow) }}</span>
              </div>
              <div class="context-usage__stat">
                <span class="context-usage__label">剩余可用</span>
                <span class="context-usage__value">{{ formatTokens(remainingTokens) }}</span>
              </div>
            </div>
          </div>

          <div class="context-usage__progress">
            <div class="context-usage__progress-bar" :style="{ width: usagePercent + '%' }"></div>
          </div>
        </div>
      </div>
    </template>
  </BDropdown>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * 上下文用量指示器属性。
 */
interface Props {
  /** 当前上下文已使用的 Token 数。 */
  usedTokens: number;
  /** 模型最大上下文窗口 Token 数。 */
  contextWindow: number;
}

const props = withDefaults(defineProps<Props>(), {
  usedTokens: 0,
  contextWindow: 200000
});

/** 下拉面板是否展开。 */
const open = ref(false);

/** 圆半径，与 viewBox 内坐标对应。 */
const RADIUS = 14;

/** 圆周长。 */
const circumference = 2 * Math.PI * RADIUS;

/** 已使用百分比，范围 0–100。 */
const usagePercent = computed<number>(() => {
  if (props.contextWindow <= 0) return 0;
  return Math.min(100, Math.round((props.usedTokens / props.contextWindow) * 100));
});

/**
 * 当前进度对应的弧长。
 * 用于 stroke-dasharray，结合 transform rotate(-90deg) 从 12 点钟开始绘制。
 */
const arcLength = computed<number>(() => {
  return (usagePercent.value / 100) * circumference;
});

/** 剩余可用 Token 数。 */
const remainingTokens = computed<number>(() => {
  return Math.max(0, props.contextWindow - props.usedTokens);
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
  stroke: var(--color-success, #10b981);
  stroke-width: 6;
  stroke-linecap: round;
  shape-rendering: geometricPrecision;

  /* 从 12 点钟方向（顶部）开始顺时针绘制 */
  transform: rotate(-90deg);
  transform-origin: 18px 18px;
  transition: stroke-dasharray 0.35s ease, stroke 0.3s ease;
}

/* ───── 面板 ───── */

.context-usage__panel {
  min-width: 188px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  box-shadow: var(--shadow-md);
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
  background: var(--usage-context, #10b981);
  border-radius: 2px;
  transition: width 0.35s ease;
}
</style>
