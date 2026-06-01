<!--
  @file index.vue
  @description 语音组件设置页，负责展示当前运行时状态并提供安装、重装和删除入口。
-->
<template>
  <BSettingsPage :title="MENU_ITEMS.speech.label">
    <div class="speech-settings__overview">
      <div class="speech-settings__overview-icon">
        <Icon icon="lucide:mic-2" />
      </div>

      <div class="speech-settings__overview-content">
        <div class="speech-settings__overview-title">本地语音服务</div>
        <div class="speech-settings__overview-desc">用于本地语音转写、模型运行和音频处理</div>
      </div>

      <div class="speech-settings__status-badge" :class="`speech-settings__status-badge--${status?.state ?? 'unknown'}`">
        <span class="speech-settings__status-dot" :class="`speech-settings__status-dot--${status?.state ?? 'unknown'}`"></span>
        {{ statusConfig.label }}
      </div>

      <SpeechActionMenu :status="status?.state" :installing="installing" @install="handleInstall" @refresh="refreshStatus" @remove="handleRemove" />
    </div>

    <BSettingsSection title="运行环境">
      <SpeechSettingsItem icon="lucide:activity" label="状态" hint="当前语音运行时检测结果">
        <span class="speech-settings__status-dot" :class="`speech-settings__status-dot--${status?.state ?? 'unknown'}`"></span>
        {{ statusConfig.label }}
      </SpeechSettingsItem>

      <SpeechSettingsItem icon="lucide:monitor" label="平台" hint="当前系统平台">
        {{ status?.platform ?? '-' }}
      </SpeechSettingsItem>

      <SpeechSettingsItem icon="lucide:binary" label="架构" hint="运行时 CPU 架构">
        {{ status?.arch ?? '-' }}
      </SpeechSettingsItem>
    </BSettingsSection>

    <BSettingsSection title="模型信息">
      <SpeechSettingsItem icon="lucide:brain" label="模型" hint="当前使用的语音识别模型">
        {{ status?.modelName ?? '-' }}
      </SpeechSettingsItem>

      <SpeechSettingsItem icon="lucide:tag" label="版本" hint="本地运行时版本">
        {{ status?.version ?? '-' }}
      </SpeechSettingsItem>

      <SpeechSettingsItem icon="lucide:folder" label="安装目录" hint="语音组件本地存储路径" :path="true">
        {{ status?.installDir ?? '-' }}
      </SpeechSettingsItem>
    </BSettingsSection>
  </BSettingsPage>
</template>

<script setup lang="ts">
import type { ElectronSpeechRuntimeStatus } from 'types/electron-api';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { message } from 'ant-design-vue';
import { getElectronAPI, hasElectronAPI } from '@/shared/platform/electron-api';
import { Modal } from '@/utils/modal';
import { MENU_ITEMS } from '@/views/settings/constants';
import SpeechActionMenu from './components/SpeechActionMenu.vue';
import SpeechSettingsItem from './components/SpeechSettingsItem.vue';

// ─── 状态映射配置 ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<NonNullable<ElectronSpeechRuntimeStatus['state']> | 'unknown', { label: string }> = {
  ready: { label: '已安装' },
  installing: { label: '安装中' },
  failed: { label: '安装失败' },
  missing: { label: '未安装' },
  unknown: { label: '未检测' }
};

// ─── 响应式状态 ────────────────────────────────────────────────────────────────

const status = ref<ElectronSpeechRuntimeStatus | null>(null);
const installing = ref(false);
const disposeProgressListener = ref<(() => void) | null>(null);

// ─── 计算属性 ──────────────────────────────────────────────────────────────────

/**
 * Electron API 实例
 * 统一获取 API,避免重复调用
 */
const electronAPI = computed(() => (hasElectronAPI() ? getElectronAPI() : null));

const statusConfig = computed(() => STATUS_CONFIG[status.value?.state ?? 'unknown']);

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function teardownProgressListener(): void {
  disposeProgressListener.value?.();
  disposeProgressListener.value = null;
}

function patchStatus(patch: Partial<ElectronSpeechRuntimeStatus>): void {
  status.value = {
    ...(status.value ?? { platform: 'darwin', arch: 'arm64' }),
    ...patch
  } as ElectronSpeechRuntimeStatus;
}

// ─── 操作处理 ──────────────────────────────────────────────────────────────────

async function refreshStatus(): Promise<void> {
  if (!hasElectronAPI()) {
    patchStatus({ state: 'failed', errorMessage: 'Electron API is not available' });
    return;
  }
  status.value = await getElectronAPI().getSpeechRuntimeStatus();
}

/**
 * 处理安装/重装语音组件
 */
async function handleInstall(): Promise<void> {
  const api = electronAPI.value;

  if (!api) {
    message.error('当前环境不支持安装语音组件');
    return;
  }

  installing.value = true;
  teardownProgressListener();
  patchStatus({ state: 'installing', errorMessage: undefined });

  disposeProgressListener.value = api.onSpeechInstallProgress(() => {
    // 进度监听回调,暂不处理
  });

  try {
    status.value = await api.installSpeechRuntime();
    message.success('语音组件已安装');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '语音组件安装失败';
    patchStatus({ state: 'failed', errorMessage });
    message.error(errorMessage);
  } finally {
    installing.value = false;
    teardownProgressListener();
  }
}

async function handleRemove(): Promise<void> {
  if (!hasElectronAPI()) {
    message.error('当前环境不支持删除语音组件');
    return;
  }

  const [cancelled] = await Modal.delete('确定要删除当前语音组件吗？');
  if (cancelled) return;

  try {
    status.value = await getElectronAPI().removeSpeechRuntime();
    message.success('语音组件已删除');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '语音组件删除失败';
    message.error(errorMessage);
  }
}

// ─── 生命周期 ──────────────────────────────────────────────────────────────────

onMounted(refreshStatus);
onUnmounted(teardownProgressListener);
</script>

<style scoped lang="less">
// ─── Overview ─────────────────────────────────────────────────────────────────

.speech-settings__overview {
  display: flex;
  gap: 14px;
  align-items: center;
  max-width: 820px;
  padding: 18px;
  margin: 0 auto 16px;
  border: 1px solid var(--color-primary-border);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.speech-settings__overview-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  font-size: 20px;
  color: var(--color-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--color-primary-border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

.speech-settings__overview-content {
  flex: 1;
  min-width: 0;
}

.speech-settings__overview-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.speech-settings__overview-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

.speech-settings__status-badge {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 999px;

  &--unknown {
    color: var(--text-tertiary);
    background: var(--bg-elevated);
    border-color: var(--border-primary);
  }

  &--ready {
    color: var(--color-success);
    background: var(--color-success-bg);
    border-color: var(--color-success);
  }

  &--installing {
    color: var(--color-primary);
    background: var(--color-primary-bg);
    border-color: var(--color-primary-border);
  }

  &--failed {
    color: var(--color-error);
    background: var(--color-error-bg);
    border-color: var(--color-error);
  }

  &--missing {
    color: var(--color-warning);
    background: var(--color-warning-bg);
    border-color: var(--color-warning-border);
  }
}

// ─── Action button (icon) ─────────────────────────────────────────────────────

.speech-settings__action-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--color-primary);
    background: var(--color-primary-bg);
    border-color: var(--color-primary-border);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
    opacity: 0.6;
  }

  &--loading {
    color: var(--color-primary);
  }
}

.speech-settings__action-icon--spin {
  animation: speech-settings-spin 1s linear infinite;
}

@keyframes speech-settings-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

// ─── More button (dropdown trigger) ───────────────────────────────────────────

.speech-settings__more-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  transition: all 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-active);
    border-color: var(--border-secondary);
  }

  &:active {
    transform: scale(0.95);
  }
}

// ─── Status dot ───────────────────────────────────────────────────────────────

.speech-settings__status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  background: var(--text-tertiary);
  border-radius: 50%;

  &--ready {
    background: var(--color-success);
  }

  &--installing {
    background: var(--color-primary);
    animation: speech-settings-pulse 1.5s ease-in-out infinite;
  }

  &--failed {
    background: var(--color-error);
  }

  &--missing {
    background: var(--color-warning);
  }
}

@keyframes speech-settings-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }
}
</style>
