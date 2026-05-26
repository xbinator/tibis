<template>
  <div v-if="request" class="confirm-bottom-sheet">
    <div class="confirm-bottom-sheet__title">
      <Icon :icon="request.riskLevel === 'dangerous' ? 'lucide:triangle-alert' : 'lucide:shield-check'" width="14" height="14" />
      <span>{{ request.title }}</span>
    </div>

    <div class="confirm-bottom-sheet__description">{{ request.description }}</div>

    <div v-if="request.beforeText" class="confirm-bottom-sheet__preview">
      <div class="confirm-bottom-sheet__label">原内容</div>
      <pre class="confirm-bottom-sheet__code">{{ truncatePreview(request.beforeText) }}</pre>
    </div>
    <div v-if="request.afterText" class="confirm-bottom-sheet__preview">
      <div class="confirm-bottom-sheet__label">{{ request.toolName === 'edit_file' ? '替换为' : '新内容' }}</div>
      <pre class="confirm-bottom-sheet__code">{{ truncatePreview(request.afterText) }}</pre>
    </div>

    <div class="confirm-bottom-sheet__actions">
      <BButton size="small" @click="handleAction('approve')">应用</BButton>
      <BButton
        v-if="request.allowRemember && request.rememberScopes?.includes('session')"
        size="small"
        type="secondary"
        @click="handleAction('approve-session')"
      >
        本会话允许
      </BButton>
      <BButton v-if="request.allowRemember && request.rememberScopes?.includes('always')" size="small" type="secondary" @click="handleAction('approve-always')">
        始终允许
      </BButton>
      <BButton size="small" type="text" @click="handleAction('cancel')">取消</BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file ConfirmationSheet.vue
 * @description 底部弹出确认卡片，用于替代消息流内的 ConfirmationCard。
 */
import type { ChatMessageConfirmationAction } from 'types/chat';
import { Icon } from '@iconify/vue';
import type { AIToolConfirmationRequest } from '@/ai/tools/confirmation';

defineOptions({ name: 'ConfirmationSheet' });

interface Props {
  /** 当前确认请求，为 null 时不渲染 */
  request: AIToolConfirmationRequest | null;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'action', action: ChatMessageConfirmationAction): void;
}>();

/** 预览文本截断最大长度 */
const PREVIEW_MAX_LENGTH = 800;

/**
 * 截断预览文本。
 * @param text - 原始文本
 * @param _toolName - 工具名称（预留扩展）
 */
function truncatePreview(text: string): string {
  if (text.length <= PREVIEW_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, PREVIEW_MAX_LENGTH)}\n...`;
}

/**
 * 处理用户操作并触发事件。
 * @param action - 确认操作类型
 */
function handleAction(action: ChatMessageConfirmationAction): void {
  emit('action', action);
}
</script>

<style scoped lang="less">
.confirm-bottom-sheet {
  padding: 14px 16px;
  pointer-events: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: 0 -4px 24px rgb(0 0 0 / 12%);
}

.confirm-bottom-sheet__title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-bottom-sheet__description {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.confirm-bottom-sheet__preview {
  margin-top: 8px;
}

.confirm-bottom-sheet__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-bottom-sheet__code {
  max-height: 120px;
  padding: 8px;
  margin: 0;
  margin-top: 4px;
  overflow: auto;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  background: var(--bg-primary);
  border-radius: 6px;
}

.confirm-bottom-sheet__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
