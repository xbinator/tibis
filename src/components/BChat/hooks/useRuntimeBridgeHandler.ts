/**
 * @file useRuntimeBridgeHandler.ts
 * @description 组装 BChat Runtime Bridge 的应用能力与上下文查询。
 */
import type { ChatRuntimeBridgeRequestEvent } from 'types/chat-runtime';
import { editorToolContextRegistry } from '@/ai/tools/context/editor';
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
import type { useNavigate } from '@/hooks/useNavigate';
import { native } from '@/shared/platform';
import { useRecentStore } from '@/stores/workspace/recent';
import { handleBChatRuntimeBridgeRequest } from '../utils/runtimeBridge';
import { useRuntimeSettings } from './useRuntimeSettings';

/**
 * Runtime Bridge hook 选项。
 */
interface UseRuntimeBridgeHandlerOptions {
  /** 打开未保存草稿 */
  openDraft: ReturnType<typeof useNavigate>['openDraft'];
  /** 按路径打开文件 */
  openFileByPath: ReturnType<typeof useNavigate>['openFileByPath'];
  /** 在应用 Webview 中打开 URL */
  openWebview: (url: URL) => void;
}

/**
 * 创建 Runtime Bridge 请求处理器。
 * @param options - 文件和导航能力
 * @returns Runtime Bridge 请求处理器
 */
export function useRuntimeBridgeHandler(options: UseRuntimeBridgeHandlerOptions): (event: ChatRuntimeBridgeRequestEvent) => Promise<unknown> {
  const recentStore = useRecentStore();
  const { getSettingsSnapshot, applyRuntimeSetting } = useRuntimeSettings();

  /** 执行当前应用级 Runtime Bridge 请求。 */
  async function handleRuntimeBridgeRequest(event: ChatRuntimeBridgeRequestEvent): Promise<unknown> {
    return handleBChatRuntimeBridgeRequest(event, {
      getEditorContext: editorToolContextRegistry.getCurrentContext,
      getEditorContextByDocumentId: (documentId) => editorToolContextRegistry.getContext(documentId),
      findFileByPath: async (filePath) => {
        const file = await recentStore.getFileByPath(filePath);
        return file ? { id: file.id } : null;
      },
      getRecentFileById: (fileId) => recentStore.getFileById(fileId),
      updateRecentFileById: (fileId, updates) => recentStore.updateFile(fileId, updates),
      getWebviewContext: webviewToolContextRegistry.getCurrentContext,
      getSettingsSnapshot,
      applySetting: applyRuntimeSetting,
      openDraft: options.openDraft,
      openFileByPath: options.openFileByPath,
      openInWebview: (url) => options.openWebview(new URL(url)),
      openExternal: (url) => native.openExternal(url)
    });
  }

  return handleRuntimeBridgeRequest;
}
