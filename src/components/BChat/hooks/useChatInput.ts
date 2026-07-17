/**
 * @file useChatInput.ts
 * @description 聊天输入状态管理 hook
 */
import type { Message } from '../utils/types';
import type { ChatMessageFile } from 'types/chat';
import { ref } from 'vue';
import { restoreSkillReferenceTokens } from '../utils/skillReference';

/**
 * 草稿输入 Hook 的依赖项
 */
interface ChatInputOptions {
  /** 聚焦输入框 */
  focusInput: () => void;
}

/**
 * 草稿输入状态管理 hook
 * @param options - 依赖项配置
 * @returns 草稿输入状态和操作方法
 */
export function useChatInput(options: ChatInputOptions) {
  /** 聊天输入框内容 */
  const inputContent = ref('');
  /** 草稿图片附件列表 */
  const inputImages = ref<ChatMessageFile[]>([]);

  /**
   * 清空当前草稿输入和文件引用，不影响对话内容
   */
  function clear(): void {
    inputContent.value = '';
    inputImages.value = [];
    options.focusInput();
  }

  /**
   * 追加草稿图片附件
   * @param files - 图片附件列表
   */
  function addImages(files: ChatMessageFile[]): void {
    inputImages.value.push(...files);
  }

  /**
   * 删除指定草稿图片
   * @param imageId - 图片 ID
   */
  function removeImage(imageId: string): void {
    inputImages.value = inputImages.value.filter((image) => image.id !== imageId);
  }

  /**
   * 从消息恢复草稿（用于编辑消息）
   * @param message - 要编辑的消息
   */
  function restoreFromMessage(message: Message): void {
    // 输入框已有内容时不覆盖，避免丢失用户正在编辑的草稿
    if (inputContent.value.trim()) return;
    inputContent.value = restoreSkillReferenceTokens(message.content, message.parts);
    inputImages.value = [...(message.files?.filter((file) => file.type === 'image') ?? [])];
  }

  /**
   * 检查输入内容是否为空
   * @returns 输入内容是否为空
   */
  function isEmpty(): boolean {
    return inputContent.value.trim().length === 0;
  }

  /**
   * 检查是否存在草稿图片
   * @returns 是否存在草稿图片
   */
  function hasImages(): boolean {
    return inputImages.value.length > 0;
  }

  return {
    inputContent,
    inputImages,
    clear,
    addImages,
    removeImage,
    restoreFromMessage,
    isEmpty,
    hasImages
  };
}
