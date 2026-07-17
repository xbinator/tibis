/**
 * @file index.ts
 * @description 剪贴板操作 Hook，统一封装文本与图片复制反馈。
 */
import { useClipboard as _useClipboard } from '@vueuse/core';
import { message } from 'ant-design-vue';
import { native } from '@/shared/platform/native';
import { asyncTo } from '@/utils/asyncTo';
import { downloadImageArrayBuffer, svgElementToPngArrayBuffer } from '@/utils/image';

/**
 * 复制反馈配置。
 */
interface CopyFeedbackOptions {
  /** 复制成功提示 */
  successMessage?: string;
  /** 复制失败兜底提示 */
  errorMessage?: string;
}

/**
 * 文本复制配置。
 */
interface CopyTextOptions {
  /** 复制成功提示 */
  successMessage?: string;
  /** 是否自动 trim 内容 */
  trim?: boolean;
}

/**
 * 图片复制来源。
 */
type CopyImageSource = ArrayBuffer | string | SVGSVGElement;

/**
 * 剪贴板操作集合。
 */
interface ClipboardActions {
  /** 复制文本到系统剪贴板 */
  clipboard: (content: string, options?: CopyTextOptions) => Promise<boolean>;
  /** 复制图片来源到系统剪贴板 */
  copyImage: (source: CopyImageSource, options?: CopyFeedbackOptions) => Promise<boolean>;
}

/**
 * 获取剪贴板操作方法。
 * @returns 剪贴板操作集合
 */
export function useClipboard(): ClipboardActions {
  const { copy } = _useClipboard();

  /**
   * 提取错误提示文本。
   * @param error - 捕获到的异常
   * @param fallbackMessage - 兜底提示
   * @returns 可展示的错误提示
   */
  function resolveErrorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error && error.message ? error.message : fallbackMessage;
  }

  /**
   * 复制文本到系统剪贴板。
   * @param content - 文本内容
   * @param options - 复制配置
   * @returns 是否复制成功
   */
  async function clipboard(content: string, options: CopyTextOptions = {}): Promise<boolean> {
    const { successMessage = '复制成功', trim = true } = options;

    const _content = trim ? content.trim() : content;

    if (!_content) return false;

    const [error] = await asyncTo(copy(_content));

    if (error) return false;

    message.success(successMessage);
    return true;
  }

  /**
   * 复制图片二进制到系统剪贴板。
   * @param content - 图片二进制内容
   * @param options - 复制反馈配置
   * @returns 是否复制成功
   */
  async function copyImageContent(content: ArrayBuffer, options: CopyFeedbackOptions = {}): Promise<boolean> {
    const { successMessage = '复制成功', errorMessage = '复制失败' } = options;
    const [error] = await asyncTo(native.copyImageToClipboard(content));

    if (error) {
      message.error(resolveErrorMessage(error, errorMessage));
      return false;
    }

    message.success(successMessage);
    return true;
  }

  /**
   * 将图片来源转换为二进制。
   * @param source - 图片复制来源
   * @param options - 复制反馈配置
   * @returns 图片二进制结果
   */
  async function resolveImageSource(source: CopyImageSource, options: CopyFeedbackOptions = {}): Promise<[Error] | [undefined, ArrayBuffer]> {
    const { errorMessage = '复制图片失败' } = options;

    if (source instanceof ArrayBuffer) {
      return [undefined, source];
    }

    if (typeof source === 'string') {
      return downloadImageArrayBuffer(source, errorMessage);
    }

    return svgElementToPngArrayBuffer(source);
  }

  /**
   * 复制图片来源到系统剪贴板。
   * @param source - 图片复制来源
   * @param options - 复制反馈配置
   * @returns 是否复制成功
   */
  async function copyImage(source: CopyImageSource, options: CopyFeedbackOptions = {}): Promise<boolean> {
    const { errorMessage = '复制图片失败' } = options;
    const [error, content] = await resolveImageSource(source, options);

    if (error) {
      message.error(resolveErrorMessage(error, errorMessage));
      return false;
    }

    return copyImageContent(content, options);
  }

  return { clipboard, copyImage };
}
