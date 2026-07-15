/**
 * @file useChatComposer.ts
 * @description 聚合 BChat 输入编辑器、附件、文件引用、模型与语音输入能力。
 */
import type { InteractionAPI } from '../components/InteractionContainer/types';
import type { ComputedRef, Ref } from 'vue';
import { computed, onMounted } from 'vue';
import type BTextEditor from '@/components/BText/Editor.vue';
import type { BTextEditorExpose, FileMentionOption } from '@/components/BText/types';
import { useFileDrop } from '@/hooks/useFileDrop';
import type { OpenFileOptions } from '@/hooks/useNavigate';
import { useRecentStore } from '@/stores/workspace/recent';
import type { FileReferenceNavigationTarget } from '@/utils/file/reference';
import { createFileRefChipResolver } from '../utils/chipResolver';
import { useChatInput } from './useChatInput';
import { useFileReference } from './useFileReference';
import { useImageUpload } from './useImageUpload';
import { useModelSelection } from './useModelSelection';
import { useVoiceInput } from './useVoiceInput';

/**
 * 输入编辑器组件实例与对外公开方法。
 */
type EditorInstance = InstanceType<typeof BTextEditor> & BTextEditorExpose;

/**
 * Chat Composer hook 依赖项。
 */
interface UseChatComposerOptions {
  /** 文件拖拽容器引用 */
  containerRef: Ref<HTMLElement | null>;
  /** 交互容器 API */
  interactionAPI: InteractionAPI;
  /** 在编辑器中打开文件 */
  openFile: (options: OpenFileOptions) => Promise<void>;
  /** 输入编辑器组件引用 */
  promptEditorRef: Ref<EditorInstance | undefined>;
}

/**
 * Chat Composer hook 返回值。
 */
interface UseChatComposerReturn {
  /** 聚焦输入编辑器 */
  focusInput: (options?: { moveToEnd?: boolean }) => void;
  /** 草稿输入状态与操作 */
  input: ReturnType<typeof useChatInput>;
  /** 模型选择状态与操作 */
  model: ReturnType<typeof useModelSelection>;
  /** 图片上传能力 */
  imageUpload: ReturnType<typeof useImageUpload>;
  /** 文件引用能力 */
  fileReference: ReturnType<typeof useFileReference>;
  /** 当前是否允许提交 */
  canSubmit: ComputedRef<boolean>;
  /** 拖拽是否进入输入区域 */
  isContainerDragActive: Ref<boolean>;
  /** 文件提及候选项 */
  fileMentionOptions: ComputedRef<FileMentionOption[]>;
  /** 文件引用 chip resolver */
  promptChipResolver: ReturnType<typeof createFileRefChipResolver>;
  /** 处理文件提及选择 */
  handleFileMentionSelect: (file: FileMentionOption) => void;
  /** 开始语音输入 */
  handleVoiceStart: ReturnType<typeof useVoiceInput>['handleVoiceStart'];
  /** 更新语音输入临时结果 */
  handleVoicePartial: ReturnType<typeof useVoiceInput>['handleVoicePartial'];
  /** 完成语音输入 */
  handleVoiceComplete: ReturnType<typeof useVoiceInput>['handleVoiceComplete'];
}

/**
 * 聚合聊天输入区域所需能力。
 * @param options - Toast 与文件导航依赖
 * @returns 输入区域状态和事件 API
 */
export function useChatComposer(options: UseChatComposerOptions): UseChatComposerReturn {
  const recentStore = useRecentStore();

  /** 聚焦输入编辑器。 */
  function focusInput(focusOptions?: { moveToEnd?: boolean }): void {
    options.promptEditorRef.value?.focus(focusOptions);
  }

  /** 保存输入编辑器光标位置。 */
  function saveCursorPosition(): void {
    options.promptEditorRef.value?.saveCursorPosition();
  }

  /** 读取输入编辑器光标位置。 */
  function getCursorPosition(): number {
    return options.promptEditorRef.value?.getCursorPosition() ?? 0;
  }

  /**
   * 替换输入编辑器文本范围。
   * @param from - 起始偏移
   * @param to - 结束偏移
   * @param text - 替换文本
   */
  function replaceTextRange(from: number, to: number, text: string): void {
    options.promptEditorRef.value?.replaceTextRange(from, to, text);
  }

  /**
   * 在当前光标处插入输入文本。
   * @param text - 插入文本
   */
  function insertTextAtCursor(text: string): void {
    options.promptEditorRef.value?.insertTextAtCursor(text);
  }

  /** 打开输入框内的文件引用。 */
  function handleOpenPromptFileReference(target: FileReferenceNavigationTarget): void {
    options.openFile({
      filePath: target.filePath,
      fileId: target.fileId,
      fileName: target.fileName,
      range: {
        startLine: target.startLine,
        endLine: target.endLine
      }
    });
  }

  const promptChipResolver = createFileRefChipResolver(handleOpenPromptFileReference);
  const input = useChatInput({ focusInput });
  const model = useModelSelection();
  const imageUpload = useImageUpload({ supportsVision: model.supportsVision, inputEvents: input, interactionAPI: options.interactionAPI });
  const fileReference = useFileReference({
    insertTextAtCursor,
    saveCursorPosition,
    focusInput
  });
  const canSubmit = computed<boolean>((): boolean => !input.isEmpty() || input.hasImages());

  const { handleVoiceStart, handleVoicePartial, handleVoiceComplete } = useVoiceInput({
    editor: {
      saveCursorPosition,
      getCursorPosition,
      replaceTextRange,
      insertTextAtCursor
    },
    showEmptyTranscriptionToast: (): void => {
      options.interactionAPI.showToast({ content: '语音转写结果为空，请重试', type: 'error' });
    }
  });

  /** 将拖入文件分发到图片附件或文本文件引用。 */
  async function handleInputDropFiles(files: File[]): Promise<void> {
    const imageFiles = files.filter((file: File): boolean => file.type.startsWith('image/'));
    const otherFiles = files.filter((file: File): boolean => !file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      await imageUpload.appendImages(imageFiles);
    }
    if (otherFiles.length > 0) {
      const tokenText = fileReference.onPasteFiles(otherFiles);
      if (tokenText) {
        insertTextAtCursor(tokenText);
      }
    }
  }

  const { isDragging: isContainerDragActive } = useFileDrop({ targetRef: options.containerRef, onDropFiles: handleInputDropFiles });
  const fileMentionOptions = computed<FileMentionOption[]>(() =>
    (recentStore.recentFiles ?? [])
      .filter((file): boolean => file.ext.toLowerCase() === 'md')
      .map((file): FileMentionOption => ({ id: file.id, name: file.name, path: file.path, ext: file.ext }))
  );

  /** 记录文件提及选择，实际 token 已由编辑器写入草稿。 */
  function handleFileMentionSelect(file: FileMentionOption): void {
    console.log('File mention selected:', file.name);
  }

  onMounted(async (): Promise<void> => {
    await model.loadSelectedModel();
    await recentStore.ensureLoaded();
  });

  return {
    focusInput,
    input,
    model,
    imageUpload,
    fileReference,
    canSubmit,
    isContainerDragActive,
    fileMentionOptions,
    promptChipResolver,
    handleFileMentionSelect,
    handleVoiceStart,
    handleVoicePartial,
    handleVoiceComplete
  };
}
