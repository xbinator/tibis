<!--
  @file ToastItem.vue
  @description 单个 Toast 提示组件，支持多种类型和自动关闭
-->
<template>
  <div :class="['toast-item', { 'toast-item--shake': shake }]">
    <div :class="['toast-item__icon', `toast-item__icon--${type}`]">
      <Icon :icon="iconName" width="16" height="16" />
    </div>
    <div class="toast-item__content">
      <component :is="contentVNode" v-if="isVNodeContent" />
      <template v-else>{{ content }}</template>
    </div>
    <button class="toast-item__close" @click.stop="handleClose">
      <Icon icon="lucide:x" width="14" height="14" />
    </button>
    <!-- 倒计时进度条 -->
    <div v-if="duration" class="toast-item__progress">
      <div class="toast-item__progress-bar" :style="{ width: progressPercent + '%' }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ToastContent, ToastType } from './types';
import { computed, isVNode, onMounted, onUnmounted, ref } from 'vue';
import { Icon } from '@iconify/vue';

/**
 * ToastItem 属性
 */
interface Props {
  /** Toast 唯一标识 */
  id: string;
  /** Toast 类型 */
  type: ToastType;
  /** Toast 内容（支持字符串或 VNode） */
  content: ToastContent;
  /** 持续时间（毫秒） */
  duration: number;
  /** 是否需要抖动动画 */
  shake?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 3000,
  shake: false
});

/**
 * 判断内容是否为 VNode
 */
const isVNodeContent = computed<boolean>(() => isVNode(props.content));

/**
 * VNode 内容（如果是 VNode 则返回，否则返回 null）
 */
const contentVNode = computed(() => (isVNodeContent.value ? props.content : null));

const emit = defineEmits<{
  (e: 'close', id: string): void;
}>();

/** 自动关闭定时器 */
let timer: ReturnType<typeof setTimeout> | null = null;
/** 倒计时进度百分比 */
const progressPercent = ref(100);
/** 动画帧 ID */
let rafId: number | null = null;
/** 开始时间 */
let startTime: number | null = null;

/**
 * 清除自动关闭定时器
 */
function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/**
 * 处理关闭事件
 */
function handleClose(): void {
  clearTimer();
  emit('close', props.id);
}

/**
 * 更新倒计时进度
 */
function updateProgress(): void {
  if (!startTime || props.duration <= 0) return;
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, props.duration - elapsed);
  progressPercent.value = (remaining / props.duration) * 100;
  if (remaining > 0) {
    rafId = requestAnimationFrame(updateProgress);
  }
}

/**
 * 启动自动关闭定时器
 */
function startTimer(): void {
  if (props.duration > 0) {
    startTime = Date.now();
    progressPercent.value = 100;
    rafId = requestAnimationFrame(updateProgress);
    timer = setTimeout(() => {
      handleClose();
    }, props.duration);
  }
}

/**
 * 根据类型返回对应的图标名称
 */
const iconName = computed<string>(() => {
  const iconMap: Record<ToastType, string> = {
    error: 'lucide:circle-x',
    warning: 'lucide:alert-triangle',
    info: 'lucide:info',
    success: 'lucide:circle-check'
  };
  return iconMap[props.type];
});

onMounted(() => {
  startTimer();
});

onUnmounted(() => {
  clearTimer();
});
</script>

<style scoped lang="less">
.toast-item {
  position: relative;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-primary);
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  transition: all 0.3s ease;

  &--shake {
    animation: shake 0.3s ease;
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }

  25% {
    transform: translateX(-4px);
  }

  50% {
    transform: translateX(4px);
  }

  75% {
    transform: translateX(-4px);
  }
}

.toast-item__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;

  &--error {
    color: var(--color-error);
  }

  &--warning {
    color: var(--color-warning);
  }

  &--info {
    color: var(--color-info);
  }

  &--success {
    color: var(--color-success);
  }
}

.toast-item__content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast-item__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}

.toast-item__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  overflow: hidden;
  background: transparent;
  border-radius: 0 0 6px 6px;
}

.toast-item__progress-bar {
  height: 100%;
  background: currentColor;
  opacity: 0.3;
  transition: none;
}
</style>
