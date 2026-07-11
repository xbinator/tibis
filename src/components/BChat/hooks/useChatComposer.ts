/**
 * @file useChatComposer.ts
 * @description 聚合 BChat 输入编辑器、附件、文件引用、模型与语音输入能力。
 */
import type { ToastOptions } from '../components/InteractionContainer/types';
import type { ComputedRef, Ref } from 'vue';
import { computed, onMounted, ref } from 'vue';
import type { FileMentionOption } from '@/components/BText/types';
import { useFileDrop } from '@/hooks/useFileDrop';
import type { OpenFileOptions } from '@/hooks/useNavigate';
import { useFilesStore } from '@/stores/workspace/files';
import type { FileReferenceNavigationTarget } from '@/utils/file/reference';
import { createFileRefChipResolver } from '../utils/chipResolver';
import { useChatInput } from './useChatInput';
import { useFileReference } from './useFileReference';
import { useImageUpload } from './useImageUpload';
import { useModelSelection } from './useModelSelection';
import { useVoiceInput } from './useVoiceInput';

/**
 * Chat Composer hook 依赖项。
 */
interface UseChatComposerOptions {
  /** 显示交互提示 */
  showToast: (options: ToastOptions) => void;
  /** 在编辑器中打开文件 */
  openFile: (options: OpenFileOptions) => Promise<void>;
  /** 输入编辑器命令适配器 */
  editor: {
    /** 聚焦编辑器 */
    focus: (options?: { moveToEnd?: boolean }) => void;
    /** 保存光标位置 */
    saveCursorPosition: () => void;
    /** 读取光标位置 */
    getCursorPosition: () => number;
    /** 替换文本范围 */
    replaceTextRange: (from: number, to: number, text: string) => void;
    /** 在光标位置插入文本 */
    insertTextAtCursor: (text: string) => void;
  };
}

/**
 * Chat Composer hook 返回值。
 */
interface UseChatComposerReturn {
  /** 文件拖拽容器 */
  containerRef: Ref<HTMLElement | undefined>;
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
  const containerRef = ref<HTMLElement>();
  const filesStore = useFilesStore();

  /** 聚焦输入编辑器。 */
  function focusInput(focusOptions?: { moveToEnd?: boolean }): void {
    options.editor.focus(focusOptions);
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
  const imageUpload = useImageUpload({ supportsVision: model.supportsVision, inputEvents: input, showToast: options.showToast });
  const fileReference = useFileReference({
    insertTextAtCursor: options.editor.insertTextAtCursor,
    saveCursorPosition: options.editor.saveCursorPosition,
    focusInput
  });
  const canSubmit = computed<boolean>(() => !input.isEmpty() || input.hasImages());

  const { handleVoiceStart, handleVoicePartial, handleVoiceComplete } = useVoiceInput({
    editor: {
      saveCursorPosition: options.editor.saveCursorPosition,
      getCursorPosition: options.editor.getCursorPosition,
      replaceTextRange: options.editor.replaceTextRange,
      insertTextAtCursor: options.editor.insertTextAtCursor
    },
    showEmptyTranscriptionToast: (): void => {
      options.showToast({ content: '语音转写结果为空，请重试', type: 'error' });
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
        options.editor.insertTextAtCursor(tokenText);
      }
    }
  }

  const { isDragging: isContainerDragActive } = useFileDrop({ targetRef: containerRef, onDropFiles: handleInputDropFiles });
  const fileMentionOptions = computed<FileMentionOption[]>(() =>
    (filesStore.recentFiles ?? [])
      .filter((file): boolean => file.ext.toLowerCase() === 'md')
      .map((file) => ({ id: file.id, name: file.name, path: file.path, ext: file.ext }))
  );

  /** 记录文件提及选择，实际 token 已由编辑器写入草稿。 */
  function handleFileMentionSelect(file: FileMentionOption): void {
    console.log('File mention selected:', file.name);
  }

  onMounted(async (): Promise<void> => {
    await model.loadSelectedModel();
    await filesStore.ensureLoaded();
  });

  return {
    containerRef,
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
