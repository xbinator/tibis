/**
 * @file useBindings.ts
 * @description 编辑器视图全局菜单事件绑定，负责把文件与编辑命令转发到当前编辑器会话。
 */
import type { EditorFile } from '../types';
import type { Ref } from 'vue';
import { onUnmounted } from 'vue';
import { marked } from 'marked';
import type { EditorController } from '@/components/BEditor/types';
import { useClipboard } from '@/hooks/useClipboard';
import { emitter } from '@/utils/emitter';

/**
 * useBindings 可响应的编辑器动作集合。
 */
interface UseBindingsOptions {
  /** 当前编辑器文件状态。 */
  fileState: Ref<EditorFile>;
  /** 当前编辑器所在 KeepAlive 标签页是否活跃。 */
  isActive?: Ref<boolean>;
  /** 编辑器文件操作集合。 */
  actions: {
    /** 保存文件。 */
    onSave: () => Promise<void>;
    /** 保存文件为新文件。 */
    onSaveAs: () => Promise<void>;
    /** 重命名文件。 */
    onRename: () => Promise<void>;
    /** 删除文件。 */
    onDelete: () => Promise<void>;
    /** 打开文件所在位置。 */
    onShowInFolder: () => Promise<void>;
    /** 复制文件。 */
    onDuplicate: () => Promise<void>;
  };
  /** 当前编辑器命令实例。 */
  editorInstance?: Ref<Pick<EditorController, 'undo' | 'redo'> | null>;
}

/**
 * 为编辑器视图注册全局菜单事件。
 * @param fileId - 当前路由中的文件 ID
 * @param options - 绑定所需的文件状态、动作与编辑器实例
 * @returns 解绑函数集合
 */
export function useBindings(fileId: Ref<string>, options: UseBindingsOptions): { unregister: () => void } {
  const { fileState, isActive, actions, editorInstance } = options;
  const { clipboard } = useClipboard();

  /**
   * 将 Markdown 渲染为 HTML。
   * @param markdown - Markdown 源文本
   * @returns HTML 字符串
   */
  async function toHtml(markdown: string): Promise<string> {
    const rendered = marked.parse(markdown);

    if (typeof rendered === 'string') {
      return rendered;
    }

    return rendered;
  }

  /**
   * 将 Markdown 转为纯文本。
   * @param markdown - Markdown 源文本
   * @returns 纯文本内容
   */
  async function toPlainText(markdown: string): Promise<string> {
    const parser = new DOMParser();
    const html = await toHtml(markdown);
    const documentNode = parser.parseFromString(html, 'text/html');

    return documentNode.body.textContent?.trim() ?? '';
  }

  /**
   * 判断当前缓存页是否应响应全局编辑命令。
   * @returns 是否应响应命令
   */
  function shouldHandleEditorCommand(): boolean {
    return isActive?.value ?? true;
  }

  const unregisters = [
    emitter.on('file:save', actions.onSave),
    emitter.on('file:saveAs', async () => {
      if (fileId.value && fileId.value !== fileState.value.id) return;
      await actions.onSaveAs();
    }),
    emitter.on('file:rename', actions.onRename),
    emitter.on('file:delete', actions.onDelete),
    emitter.on('file:duplicate', actions.onDuplicate),
    emitter.on('edit:undo', () => {
      if (!shouldHandleEditorCommand()) return;
      editorInstance?.value?.undo();
    }),
    emitter.on('edit:redo', () => {
      if (!shouldHandleEditorCommand()) return;
      editorInstance?.value?.redo();
    }),
    emitter.on('edit:copyPlainText', async () => {
      const plainText = await toPlainText(fileState.value.content);
      await clipboard(plainText, { successMessage: '已复制纯文本' });
    }),
    emitter.on('edit:copyMarkdown', async () => {
      await clipboard(fileState.value.content, { successMessage: '已复制 Markdown' });
    }),
    emitter.on('edit:copyHtml', async () => {
      const html = await toHtml(fileState.value.content);
      await clipboard(html, { successMessage: '已复制 HTML 代码' });
    })
  ];

  /**
   * 注销当前编辑器视图的所有全局事件监听。
   */
  const unregister = (): void => {
    unregisters.forEach((fn) => fn());
  };

  onUnmounted(() => {
    unregister();
  });

  return {
    unregister
  };
}
