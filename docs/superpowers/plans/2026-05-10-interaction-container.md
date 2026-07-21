# BChatSidebar 交互容器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 BChatSidebar 创建统一的交互容器，支持错误提示堆叠和确认对话框

**Architecture:** 使用 provide/inject 模式，InteractionContainer 作为容器组件，ToastStack 管理 Toast 队列，ConfirmModal 处理确认对话框，useInteraction hook 提供类型安全的 API

**Tech Stack:** Vue 3 Composition API, TypeScript, CSS Transitions

---

## 文件结构

**新建文件：**
- `src/components/BChatSidebar/components/InteractionContainer/index.vue` - 主容器组件，提供交互 API
- `src/components/BChatSidebar/components/InteractionContainer/ToastStack.vue` - Toast 堆叠显示组件
- `src/components/BChatSidebar/components/InteractionContainer/ToastItem.vue` - 单个 Toast 提示组件
- `src/components/BChatSidebar/components/InteractionContainer/ConfirmModal.vue` - 确认对话框组件
- `src/components/BChatSidebar/components/InteractionContainer/types.ts` - 类型定义
- `src/components/BChatSidebar/hooks/useInteraction.ts` - inject hook

**修改文件：**
- `src/components/BChatSidebar/index.vue` - 集成 InteractionContainer
- `src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue` - 使用 useInteraction 替换 message 和 Modal

---

## Task 1: 创建类型定义文件

**Files:**
- Create: `src/components/BChatSidebar/components/InteractionContainer/types.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
/**
 * @file types.ts
 * @description 交互容器的类型定义
 */

/**
 * Toast 提示类型
 */
export type ToastType = 'error' | 'warning' | 'info' | 'success';

/**
 * Toast 提示选项
 */
export interface ToastOptions {
  /** 提示类型 */
  type: ToastType;
  /** 提示内容 */
  content: string;
  /** 持续时间（毫秒），默认 3000ms */
  duration?: number;
}

/**
 * Toast 提示项
 */
export interface ToastItem {
  /** 唯一标识 */
  id: string;
  /** 提示类型 */
  type: ToastType;
  /** 提示内容 */
  content: string;
  /** 持续时间（毫秒） */
  duration: number;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 确认对话框选项
 */
export interface ConfirmOptions {
  /** 对话框标题 */
  title?: string;
  /** 对话框内容 */
  content: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 是否为危险操作（红色确认按钮） */
  danger?: boolean;
}

/**
 * 确认对话框状态
 */
export interface ConfirmState {
  /** 是否显示 */
  visible: boolean;
  /** 对话框选项 */
  options: ConfirmOptions;
  /** Promise resolve 函数 */
  resolve: (value: boolean) => void;
}

/**
 * 交互 API
 */
export interface InteractionAPI {
  /** 显示 Toast 提示 */
  showToast: (options: ToastOptions) => void;
  /** 显示确认对话框 */
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}
```

- [ ] **Step 2: 提交类型定义**

```bash
git add src/components/BChatSidebar/components/InteractionContainer/types.ts
git commit -m "feat(interaction): add type definitions"
```

---

## Task 2: 创建 ToastItem 组件

**Files:**
- Create: `src/components/BChatSidebar/components/InteractionContainer/ToastItem.vue`

- [ ] **Step 1: 创建 ToastItem 组件**

```vue
<!--
  @file ToastItem.vue
  @description 单个 Toast 提示组件，支持多种类型和自动关闭
-->
<template>
  <div :class="['toast-item', `toast-item--${type}`]" @click="handleClose">
    <div class="toast-item__icon">
      <Icon :icon="iconName" width="16" height="16" />
    </div>
    <div class="toast-item__content">{{ content }}</div>
    <button class="toast-item__close" @click.stop="handleClose">
      <Icon icon="lucide:x" width="14" height="14" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import type { ToastType } from './types';

/**
 * ToastItem 属性
 */
interface Props {
  /** Toast 唯一标识 */
  id: string;
  /** Toast 类型 */
  type: ToastType;
  /** Toast 内容 */
  content: string;
  /** 持续时间（毫秒） */
  duration: number;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 3000
});

const emit = defineEmits<{
  (e: 'close', id: string): void;
}>();

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

/** 自动关闭定时器 */
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * 启动自动关闭定时器
 */
function startTimer(): void {
  if (props.duration > 0) {
    timer = setTimeout(() => {
      handleClose();
    }, props.duration);
  }
}

/**
 * 清除自动关闭定时器
 */
function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * 处理关闭事件
 */
function handleClose(): void {
  clearTimer();
  emit('close', props.id);
}

onMounted(() => {
  startTimer();
});

onUnmounted(() => {
  clearTimer();
});
</script>

<style scoped lang="less">
.toast-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  &--error {
    background: #fee2e2;
    border-left: 3px solid #ef4444;
  }

  &--warning {
    background: #fef3c7;
    border-left: 3px solid #f59e0b;
  }

  &--info {
    background: #dbeafe;
    border-left: 3px solid #3b82f6;
  }

  &--success {
    background: #d1fae5;
    border-left: 3px solid #10b981;
  }
}

.toast-item__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
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
  color: var(--text-secondary);
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
</style>
```

- [ ] **Step 2: 提交 ToastItem 组件**

```bash
git add src/components/BChatSidebar/components/InteractionContainer/ToastItem.vue
git commit -m "feat(interaction): add ToastItem component"
```

---

## Task 3: 创建 ToastStack 组件

**Files:**
- Create: `src/components/BChatSidebar/components/InteractionContainer/ToastStack.vue`

- [ ] **Step 1: 创建 ToastStack 组件**

```vue
<!--
  @file ToastStack.vue
  @description Toast 提示堆叠组件，管理多个 Toast 的显示和移除
-->
<template>
  <TransitionGroup name="toast" tag="div" class="toast-stack">
    <ToastItem
      v-for="toast in toasts"
      :key="toast.id"
      :id="toast.id"
      :type="toast.type"
      :content="toast.content"
      :duration="toast.duration"
      @close="handleClose"
    />
  </TransitionGroup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import ToastItem from './ToastItem.vue';
import type { ToastItem as ToastItemType } from './types';

/**
 * ToastStack 属性
 */
interface Props {
  /** 最大显示数量 */
  maxCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxCount: 3
});

const emit = defineEmits<{
  (e: 'remove', id: string): void;
}>();

/** Toast 队列 */
const toasts = ref<ToastItemType[]>([]);

/**
 * 添加 Toast
 * @param toast - Toast 项
 */
function addToast(toast: ToastItemType): void {
  toasts.value.push(toast);

  // 超出最大数量时，移除最早的
  if (toasts.value.length > props.maxCount) {
    const removed = toasts.value.shift();
    if (removed) {
      emit('remove', removed.id);
    }
  }
}

/**
 * 移除 Toast
 * @param id - Toast ID
 */
function removeToast(id: string): void {
  const index = toasts.value.findIndex((t) => t.id === id);
  if (index > -1) {
    toasts.value.splice(index, 1);
    emit('remove', id);
  }
}

/**
 * 处理 Toast 关闭事件
 * @param id - Toast ID
 */
function handleClose(id: string): void {
  removeToast(id);
}

/**
 * 清空所有 Toast
 */
function clearAll(): void {
  toasts.value = [];
}

defineExpose({
  addToast,
  removeToast,
  clearAll
});
</script>

<style scoped lang="less">
.toast-stack {
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  width: 100%;
}

/* Toast 进入动画 */
.toast-enter-active {
  animation: toast-in 0.3s ease;
}

/* Toast 离开动画 */
.toast-leave-active {
  animation: toast-out 0.3s ease;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-10px);
  }
}
</style>
```

- [ ] **Step 2: 提交 ToastStack 组件**

```bash
git add src/components/BChatSidebar/components/InteractionContainer/ToastStack.vue
git commit -m "feat(interaction): add ToastStack component"
```

---

## Task 4: 创建 ConfirmModal 组件

**Files:**
- Create: `src/components/BChatSidebar/components/InteractionContainer/ConfirmModal.vue`

- [ ] **Step 1: 创建 ConfirmModal 组件**

```vue
<!--
  @file ConfirmModal.vue
  @description 确认对话框组件，支持自定义标题、内容和按钮
-->
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="confirm-modal-overlay" @click="handleOverlayClick">
        <div class="confirm-modal" @click.stop>
          <div v-if="title" class="confirm-modal__header">
            <div class="confirm-modal__title">{{ title }}</div>
          </div>

          <div class="confirm-modal__body">{{ content }}</div>

          <div class="confirm-modal__footer">
            <BButton type="secondary" @click="handleCancel">{{ cancelText }}</BButton>
            <BButton :type="danger ? 'danger' : 'primary'" @click="handleConfirm">{{ confirmText }}</BButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import BButton from '@/components/BButton/index.vue';

/**
 * ConfirmModal 属性
 */
interface Props {
  /** 是否显示 */
  visible: boolean;
  /** 对话框标题 */
  title?: string;
  /** 对话框内容 */
  content: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 是否为危险操作 */
  danger?: boolean;
  /** 是否允许点击遮罩层关闭 */
  maskClosable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  maskClosable: true
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

/**
 * 处理确认按钮点击
 */
function handleConfirm(): void {
  emit('confirm');
}

/**
 * 处理取消按钮点击
 */
function handleCancel(): void {
  emit('cancel');
}

/**
 * 处理遮罩层点击
 */
function handleOverlayClick(): void {
  if (props.maskClosable) {
    handleCancel();
  }
}

/**
 * 处理 ESC 键按下
 * @param event - 键盘事件
 */
function handleEscKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.visible) {
    handleCancel();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscKey);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscKey);
});
</script>

<style scoped lang="less">
.confirm-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.confirm-modal {
  min-width: 320px;
  max-width: 480px;
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.confirm-modal__header {
  padding: 16px 16px 0;
}

.confirm-modal__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-modal__body {
  padding: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.confirm-modal__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary);
}

/* Modal 进入动画 */
.modal-enter-active {
  animation: modal-in 0.3s ease;
}

/* Modal 离开动画 */
.modal-leave-active {
  animation: modal-out 0.3s ease;
}

@keyframes modal-in {
  from {
    opacity: 0;

    .confirm-modal {
      transform: scale(0.9);
    }
  }

  to {
    opacity: 1;

    .confirm-modal {
      transform: scale(1);
    }
  }
}

@keyframes modal-out {
  from {
    opacity: 1;

    .confirm-modal {
      transform: scale(1);
    }
  }

  to {
    opacity: 0;

    .confirm-modal {
      transform: scale(0.9);
    }
  }
}
</style>
```

- [ ] **Step 2: 提交 ConfirmModal 组件**

```bash
git add src/components/BChatSidebar/components/InteractionContainer/ConfirmModal.vue
git commit -m "feat(interaction): add ConfirmModal component"
```

---

## Task 5: 创建 useInteraction hook

**Files:**
- Create: `src/components/BChatSidebar/hooks/useInteraction.ts`

- [ ] **Step 1: 创建 useInteraction hook**

```typescript
/**
 * @file useInteraction.ts
 * @description 交互容器 inject hook，提供类型安全的交互 API
 */
import { inject } from 'vue';
import type { InteractionAPI } from '../components/InteractionContainer/types';

/**
 * 获取交互 API
 * @returns 交互 API
 * @throws 如果在 InteractionContainer 外部使用则抛出错误
 */
export function useInteraction(): InteractionAPI {
  const api = inject<InteractionAPI>('interaction');

  if (!api) {
    throw new Error('useInteraction must be used within InteractionContainer');
  }

  return api;
}
```

- [ ] **Step 2: 提交 useInteraction hook**

```bash
git add src/components/BChatSidebar/hooks/useInteraction.ts
git commit -m "feat(interaction): add useInteraction hook"
```

---

## Task 6: 创建 InteractionContainer 主组件

**Files:**
- Create: `src/components/BChatSidebar/components/InteractionContainer/index.vue`

- [ ] **Step 1: 创建 InteractionContainer 主组件**

```vue
<!--
  @file index.vue
  @description 交互容器主组件，管理 Toast 和 Confirm 的显示
-->
<template>
  <div class="interaction-container">
    <ToastStack ref="toastStackRef" :max-count="maxToastCount" />
    <ConfirmModal
      :visible="confirmState?.visible ?? false"
      :title="confirmState?.options.title"
      :content="confirmState?.options.content ?? ''"
      :confirm-text="confirmState?.options.confirmText"
      :cancel-text="confirmState?.options.cancelText"
      :danger="confirmState?.options.danger"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { provide, ref } from 'vue';
import ToastStack from './ToastStack.vue';
import ConfirmModal from './ConfirmModal.vue';
import type { ToastOptions, ToastItem, ConfirmOptions, ConfirmState, InteractionAPI } from './types';

/**
 * InteractionContainer 属性
 */
interface Props {
  /** 最大 Toast 显示数量 */
  maxToastCount?: number;
  /** 默认 Toast 持续时间（毫秒） */
  defaultDuration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxToastCount: 3,
  defaultDuration: 3000
});

/** ToastStack 组件引用 */
const toastStackRef = ref<InstanceType<typeof ToastStack>>();

/** Confirm 对话框状态 */
const confirmState = ref<ConfirmState | null>(null);

/**
 * 显示 Toast 提示
 * @param options - Toast 选项
 */
function showToast(options: ToastOptions): void {
  const toast: ToastItem = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: options.type,
    content: options.content,
    duration: options.duration ?? props.defaultDuration,
    createdAt: Date.now()
  };

  toastStackRef.value?.addToast(toast);
}

/**
 * 显示确认对话框
 * @param options - 确认对话框选项
 * @returns Promise<boolean> - 用户确认返回 true，取消返回 false
 */
function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.value = {
      visible: true,
      options,
      resolve
    };
  });
}

/**
 * 处理确认按钮点击
 */
function handleConfirm(): void {
  if (confirmState.value) {
    confirmState.value.resolve(true);
    confirmState.value.visible = false;

    // 延迟清除状态，等待动画完成
    setTimeout(() => {
      confirmState.value = null;
    }, 300);
  }
}

/**
 * 处理取消按钮点击
 */
function handleCancel(): void {
  if (confirmState.value) {
    confirmState.value.resolve(false);
    confirmState.value.visible = false;

    // 延迟清除状态，等待动画完成
    setTimeout(() => {
      confirmState.value = null;
    }, 300);
  }
}

/** 提供交互 API */
provide<InteractionAPI>('interaction', {
  showToast,
  showConfirm
});
</script>

<style scoped lang="less">
.interaction-container {
  position: relative;
  width: 100%;
  padding: 0 12px 12px;
}
</style>
```

- [ ] **Step 2: 提交 InteractionContainer 主组件**

```bash
git add src/components/BChatSidebar/components/InteractionContainer/index.vue
git commit -m "feat(interaction): add InteractionContainer component"
```

---

## Task 7: 集成到 BChatSidebar

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`

- [ ] **Step 1: 在 BChatSidebar 中导入 InteractionContainer**

在 `src/components/BChatSidebar/index.vue` 的 script 部分添加导入：

```typescript
import InteractionContainer from './components/InteractionContainer/index.vue';
```

找到第 19 行左右的导入语句区域，在 `import UsagePanel from './components/UsagePanel.vue';` 后添加。

- [ ] **Step 2: 在模板中添加 InteractionContainer**

在 `src/components/BChatSidebar/index.vue` 的模板中，在第 47 行（`<!--  -->` 注释处）添加 InteractionContainer：

```vue
      <InteractionContainer />
```

替换原有的 `<!--  -->` 注释。

- [ ] **Step 3: 提交集成更改**

```bash
git add src/components/BChatSidebar/index.vue
git commit -m "feat(interaction): integrate InteractionContainer into BChatSidebar"
```

---

## Task 8: 迁移 VoiceInput 使用 useInteraction

**Files:**
- Modify: `src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue`

- [ ] **Step 1: 导入 useInteraction hook**

在 `src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue` 的 script 部分，删除 ant-design-vue 的 message 导入，添加 useInteraction：

找到第 8 行：
```typescript
import { message } from 'ant-design-vue';
```

替换为：
```typescript
import { useInteraction } from '../../hooks/useInteraction';
```

- [ ] **Step 2: 删除 Modal 导入**

找到第 10 行：
```typescript
import { Modal } from '@/utils/modal';
```

删除这一行（因为不再使用）。

- [ ] **Step 3: 在 setup 中获取 interaction API**

在 script setup 中，在 `const emit = defineEmits...` 后添加：

```typescript
const { showToast, showConfirm } = useInteraction();
```

- [ ] **Step 4: 替换麦克风权限错误提示（系统权限）**

找到第 130 行：
```typescript
message.error('麦克风权限未开启，请在系统设置中开启');
```

替换为：
```typescript
showToast({ type: 'error', content: '麦克风权限未开启，请在系统设置中开启' });
```

- [ ] **Step 5: 替换语音组件安装确认对话框**

找到第 144-147 行：
```typescript
const [cancelled] = await Modal.confirm('语音组件未安装', '首次使用语音输入需要下载语音组件，是否立即下载？', {
  confirmText: '下载'
});
if (cancelled) {
```

替换为：
```typescript
const confirmed = await showConfirm({
  title: '语音组件未安装',
  content: '首次使用语音输入需要下载语音组件，是否立即下载？',
  confirmText: '下载'
});
if (!confirmed) {
```

- [ ] **Step 6: 替换安装进度提示**

找到第 152-156 行：
```typescript
unbindInstallProgress.value = electronAPI.onSpeechInstallProgress((progress) => {
  message.loading({
    content: `正在安装语音组件：${progress.message}`,
    key: 'speech-runtime-install',
    duration: 0
  });
});
```

替换为：
```typescript
unbindInstallProgress.value = electronAPI.onSpeechInstallProgress((progress) => {
  showToast({
    type: 'info',
    content: `正在安装语音组件：${progress.message}`,
    duration: 0
  });
});
```

- [ ] **Step 7: 替换安装成功提示**

找到第 162 行：
```typescript
message.success({ content: '语音组件安装完成', key: 'speech-runtime-install' });
```

替换为：
```typescript
showToast({ type: 'success', content: '语音组件安装完成' });
```

- [ ] **Step 8: 替换安装失败提示**

找到第 165-169 行：
```typescript
message.error({
  content: error instanceof Error ? error.message : '语音组件安装失败',
  key: 'speech-runtime-install'
});
```

替换为：
```typescript
showToast({
  type: 'error',
  content: error instanceof Error ? error.message : '语音组件安装失败'
});
```

- [ ] **Step 9: 替换麦克风权限错误提示（浏览器权限）**

找到第 175 行：
```typescript
message.error('麦克风权限未开启，请在系统设置中开启');
```

替换为：
```typescript
showToast({ type: 'error', content: '麦克风权限未开启，请在系统设置中开启' });
```

- [ ] **Step 10: 替换启动录音失败提示**

找到第 177 行：
```typescript
message.error('启动录音失败，请重试');
```

替换为：
```typescript
showToast({ type: 'error', content: '启动录音失败，请重试' });
```

- [ ] **Step 11: 替换语音转写失败提示**

找到第 195 行：
```typescript
message.error('语音转写失败，请重试');
```

替换为：
```typescript
showToast({ type: 'error', content: '语音转写失败，请重试' });
```

- [ ] **Step 12: 提交 VoiceInput 迁移**

```bash
git add src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue
git commit -m "refactor(voice-input): migrate to useInteraction API"
```

---

## Task 9: 更新 changelog

**Files:**
- Create: `changelog/2026-05-10.md`

- [ ] **Step 1: 创建 changelog 文件**

```markdown
# 2026-05-10

## Added
- 新增 InteractionContainer 交互容器组件，支持 Toast 提示和确认对话框
- 新增 ToastItem 组件，支持 error/warning/info/success 四种类型
- 新增 ToastStack 组件，管理 Toast 堆叠显示
- 新增 ConfirmModal 组件，支持模态确认对话框
- 新增 useInteraction hook，提供类型安全的交互 API

## Changed
- VoiceInput 组件迁移到 useInteraction API，统一交互体验
- BChatSidebar 集成 InteractionContainer，提供统一的错误和确认交互
```

- [ ] **Step 2: 提交 changelog**

```bash
git add changelog/2026-05-10.md
git commit -m "docs: add changelog for interaction container feature"
```

---

## Task 10: 运行类型检查和 lint

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
npm run typecheck
```

Expected: 无类型错误

- [ ] **Step 2: 运行 ESLint 检查**

```bash
npm run lint
```

Expected: 无 lint 错误

- [ ] **Step 3: 修复任何问题**

如果类型检查或 lint 发现问题，根据错误信息修复代码。

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-05-10-interaction-container.md`。

**两种执行方式：**

1. **Subagent-Driven（推荐）** - 每个任务派发一个新的子代理，任务间进行审查，快速迭代

2. **Inline Execution** - 在当前会话中使用 executing-plans 执行，批量执行并在检查点审查

**选择哪种方式？**
