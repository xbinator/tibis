import { useClipboard as _useClipboard } from '@vueuse/core';
import { message } from 'ant-design-vue';
import { asyncTo } from '@/utils/asyncTo';

interface CopyTextOptions {
  // 复制成功提示
  successMessage?: string;
  // 是否自动 trim 内容
  trim?: boolean;
}

export function useClipboard() {
  const { copy } = _useClipboard();

  async function clipboard(content: string, options: CopyTextOptions = {}) {
    const { successMessage = '复制成功', trim = true } = options;

    const _content = trim ? content.trim() : content;

    if (!_content) return false;

    const [error] = await asyncTo(copy(_content));

    if (error) return false;

    message.success(successMessage);
  }

  return { clipboard };
}
