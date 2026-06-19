<template>
  <div :class="name">
    <BBubble :show-container="showContainer" :placement="bubblePlacement" :loading="message.loading" :size="message.role === 'user' ? 'auto' : 'fill'">
      <template v-if="showHeader" #header>
        <div :class="bem('header')">
          <div v-if="imageFiles.length" :class="bem('images')">
            <img
              v-for="(file, index) in imageFiles"
              :key="file.id"
              :src="file.url || file.path"
              :alt="file.name"
              :class="bem('image', { single: isSingleImage })"
              @click="handleImageClick(index)"
            />
          </div>
          <div v-if="otherFiles.length" :class="bem('files')">
            <div v-for="file in otherFiles" :key="file.id" :class="bem('file')">
              <BIcon icon="lucide:file" :size="14" />
              <span :class="bem('file-name')">{{ file.name }}</span>
            </div>
          </div>
        </div>
      </template>

      <div :class="bem('parts')">
        <BubblePartCompression v-if="isCompressionMessage || isInterruptMessage" :message="message" />

        <!-- 非压缩消息才渲染各片段，压缩消息仅显示 BubblePartCompression -->
        <template v-if="!isCompressionMessage">
          <template v-for="(item, index) in renderableParts" :key="`${item.type}-${index}`">
            <BubblePartUserInput v-if="isUserMessage" :part="item as ChatMessageTextPart" />

            <BubblePartText v-else-if="item.type === 'text' || item.type === 'error'" :item="item" :part="item" />

            <BubblePartThinking v-else-if="item.type === 'thinking'" :part="item" />

            <QuestionCard
              v-else-if="!disabled && isAwaitingUserChoiceResult(item)"
              :question="item.result.data"
              :disabled="disabled"
              @submit-choice="$emit('user-choice-submit', $event)"
            />

            <BubblePartTool v-else-if="item.type === 'tool'" :part="item" />
          </template>
        </template>
      </div>
    </BBubble>

    <!-- 助手消息工具栏 -->
    <div v-if="showAssistantToolbar" :class="bem('toolbar')">
      <BButton type="text" size="small" square icon="lucide:copy" @click="handleCopy(message)" />
      <BButton square type="text" size="small" icon="lucide:refresh-cw" @click="$emit('regenerate', message)" />
    </div>

    <!-- 用户消息底部：时间戳 + 回退按钮 + 复制按钮（hover 可见） -->
    <div v-if="isUserMessage && message.finished" :class="bem('toolbar', { right: isUserMessage })">
      <span :class="bem('time')">{{ formatMessageTime(message.createdAt) }}</span>
      <BButton v-if="showRollback" type="text" size="small" square icon="lucide:undo-2" @click="$emit('rollback', message)" />
      <BButton v-if="showContainer" type="text" size="small" square icon="lucide:copy" @click="handleCopy(message)" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file MessageBubble.vue
 * @description 聊天气泡组件，按结构化消息片段渲染文本、思考、工具调用和工具结果。
 */
import type { Message } from '../utils/types';
import type { AIUserChoiceAnswerData, ChatMessageTextPart } from 'types/chat';
import { computed } from 'vue';
import BBubble from '@/components/BBubble/index.vue';
import { useClipboard } from '@/hooks/useClipboard';
import type { ImagePreviewItem } from '@/hooks/useImagePreview';
import { useImagePreview } from '@/hooks/useImagePreview';
import { createNamespace } from '@/utils/namespace';
import { extractLastTextPart, isAwaitingUserChoiceResult } from '../utils/messageHelper';
import { formatMessageTime } from '../utils/timeFormat';
import BubblePartCompression from './MessageBubble/BubblePartCompression.vue';
import BubblePartText from './MessageBubble/BubblePartText.vue';
import BubblePartThinking from './MessageBubble/BubblePartThinking.vue';
import BubblePartTool from './MessageBubble/BubblePartTool.vue';
import BubblePartUserInput from './MessageBubble/BubblePartUserInput.vue';
import QuestionCard from './QuestionCard.vue';

defineOptions({ name: 'MessageBubble' });

const { clipboard } = useClipboard();
const { previewImage } = useImagePreview();

const [name, bem] = createNamespace('', 'message-bubble');

const props = defineProps<{
  message: Message;
  /** 会话已结束时禁用交互（如 QuestionCard） */
  disabled?: boolean;
  /** 判断消息是否可回退 */
  canRollback?: (message: Message) => boolean;
}>();

defineEmits<{
  (e: 'edit', message: Message): void;
  (e: 'regenerate', message: Message): void;
  (e: 'user-choice-submit', answer: AIUserChoiceAnswerData): void;
  (e: 'rollback', message: Message): void;
}>();

/** 图片文件列表（有 url 或 path 的图片类型文件） */
const imageFiles = computed(() => props.message.files?.filter((file) => file.type === 'image' && (file.url || file.path)) ?? []);
/** 是否为单图模式 */
const isSingleImage = computed(() => imageFiles.value.length === 1);
/** 非图片文件列表（非图片类型或无 url/path 的文件） */
const otherFiles = computed(() => props.message.files?.filter((file) => file.type !== 'image' || (!file.url && !file.path)) ?? []);
/** 是否为用户消息 */
const isUserMessage = computed(() => props.message.role === 'user');
/** 是否为助手消息 */
const isAssistantMessage = computed(() => props.message.role === 'assistant');
/** 是否为压缩消息 */
const isCompressionMessage = computed(() => props.message.role === 'compression');
/** 是否为中断消息 */
const isInterruptMessage = computed(() => props.message.role === 'interrupt');
/** 气泡位置：助手和错误消息靠左，用户消息靠右 */
const bubblePlacement = computed(() => (isUserMessage.value ? 'right' : 'left'));
/** 是否显示头部（用户消息且有文件时显示） */
const showHeader = computed(() => isUserMessage.value && (imageFiles.value.length || otherFiles.value.length));
/** 是否显示气泡容器（用户消息且有文件时显示） */
const showContainer = computed(() => isCompressionMessage.value || isInterruptMessage.value || !!props.message.parts?.length);
/** 是否显示助手工具栏 */
const showAssistantToolbar = computed(() => props.message.finished === true && isAssistantMessage.value);

/** 是否显示回退按钮（仅在后面还有消息时显示） */
const showRollback = computed(() => isUserMessage.value && props.message.finished === true && props.canRollback?.(props.message));

/** 图片预览条目列表 */
const imagePreviewItems = computed<ImagePreviewItem[]>(() =>
  imageFiles.value.map((file) => ({
    src: file.url || file.path || '',
    name: file.name,
    mimeType: file.mimeType
  }))
);

/**
 * 过滤后的消息片段。排除已移至底部弹窗的 confirmation 片段。
 */
const renderableParts = computed(() => props.message.parts.filter((p) => p.type !== 'confirmation'));

/**
 * 打开图片预览。
 * @param index - 图片索引
 */
async function handleImageClick(index: number): Promise<void> {
  await previewImage({
    images: imagePreviewItems.value,
    startPosition: index
  });
}

/**
 * 复制消息内容
 * @param message - 待复制的聊天消息
 */
function handleCopy(message: Message): void {
  const content = extractLastTextPart(message);
  clipboard(content, { successMessage: '已复制到剪贴板' });
}
</script>

<style scoped lang="less">
.message-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  user-select: text;

  &:hover {
    .message-bubble__toolbar {
      opacity: 1;
    }
  }
}

.message-bubble:last-child {
  margin-bottom: 0;
}

.message-bubble__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-bubble__images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-bubble__image {
  overflow: hidden;
  cursor: pointer;
  object-fit: cover;
  border: 1px solid var(--border-primary);
  border-radius: 8px;

  &.message-bubble__image--single {
    max-width: 200px;
    max-height: 200px;
    object-fit: contain;
  }

  &:not(.message-bubble__image--single) {
    width: 60px;
    height: 60px;
  }
}

.message-bubble__files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-bubble__file {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 220px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
}

.message-bubble__file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-bubble__parts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-bubble__toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 6px;

  &.message-bubble__toolbar--right {
    justify-content: flex-end;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
}

.message-bubble__time {
  font-size: 11px;
  color: var(--text-primary);
  user-select: none;
}
</style>
