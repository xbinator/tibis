/**
 * @file useVoiceInput.ts
 * @description 聊天输入框语音转写插入状态管理 hook。
 */
import { ref } from 'vue';

/**
 * BTextEditor 语音输入所需的编辑操作。
 */
interface BTextEditorVoiceActions {
  /** 保存当前光标位置。 */
  saveCursorPosition: () => void;
  /** 读取当前光标位置。 */
  getCursorPosition: () => number;
  /** 替换指定文本范围。 */
  replaceTextRange: (from: number, to: number, text: string) => void;
  /** 在当前光标位置插入文本。 */
  insertTextAtCursor: (text: string) => void;
}

/**
 * 语音输入 hook 配置。
 */
interface UseVoiceInputOptions {
  /** BTextEditor 语音输入所需的编辑操作。 */
  editor: BTextEditorVoiceActions;
  /** 显示空转写结果提示。 */
  showEmptyTranscriptionToast: () => void;
}

/**
 * 语音输入 hook 返回值。
 */
interface UseVoiceInputReturn {
  /** 处理语音输入开始事件。 */
  handleVoiceStart: () => void;
  /** 处理语音实时转写增量文本。 */
  handleVoicePartial: (payload: { text: string }) => void;
  /** 处理语音最终转写文本。 */
  handleVoiceComplete: (payload: { text: string }) => void;
}

/**
 * 当前语音实时转写在输入框中的占位范围。
 */
interface VoiceInsertionRange {
  /** 占位起点。 */
  start: number;
  /** 占位终点。 */
  end: number;
}

/**
 * 管理语音实时转写文本在 BTextEditor 中的插入和替换。
 * @param options - 语音输入 hook 配置
 * @returns 语音输入事件处理器
 */
export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn {
  const activeVoiceInsertionRange = ref<VoiceInsertionRange | null>(null);

  /**
   * 替换语音占位范围中的文本。
   * @param text - 新的占位文本
   */
  function replaceVoiceInsertionText(text: string): void {
    const range = activeVoiceInsertionRange.value;

    if (!range) {
      return;
    }

    options.editor.replaceTextRange(range.start, range.end, text);
    activeVoiceInsertionRange.value = {
      start: range.start,
      end: range.start + text.length
    };
  }

  /**
   * 记录本次语音输入在编辑器中的插入起点。
   */
  function handleVoiceStart(): void {
    options.editor.saveCursorPosition();
    const cursorPosition = options.editor.getCursorPosition();
    activeVoiceInsertionRange.value = {
      start: cursorPosition,
      end: cursorPosition
    };
  }

  /**
   * 处理语音实时转写增量文本。
   * @param payload - 增量转写文本
   */
  function handleVoicePartial(payload: { text: string }): void {
    replaceVoiceInsertionText(payload.text);
  }

  /**
   * 使用最终转写文本插入到光标位置。
   * @param payload - 语音转写结果
   */
  function handleVoiceComplete(payload: { text: string }): void {
    const hadActiveVoiceInsertion = Boolean(activeVoiceInsertionRange.value);

    if (!payload.text.trim()) {
      if (hadActiveVoiceInsertion) {
        replaceVoiceInsertionText('');
        activeVoiceInsertionRange.value = null;
      }
      options.showEmptyTranscriptionToast();
      return;
    }

    if (hadActiveVoiceInsertion) {
      replaceVoiceInsertionText(payload.text);
      activeVoiceInsertionRange.value = null;
      return;
    }

    options.editor.insertTextAtCursor(payload.text);
  }

  return {
    handleVoiceStart,
    handleVoicePartial,
    handleVoiceComplete
  };
}
