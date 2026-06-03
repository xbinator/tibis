/**
 * @file WebpageTool/index.ts
 * @description 当前网页读取工具。
 */
import type { AIToolExecutor } from 'types/ai';
import type { WebviewPageSnapshot, WebviewToolContext } from '@/ai/tools/context/webview';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** 当前网页读取工具名称。 */
export const READ_CURRENT_WEBPAGE_TOOL_NAME = 'read_current_webpage';

/**
 * 当前网页读取工具选项。
 */
export interface CreateBuiltinWebpageToolOptions {
  /** 获取当前激活 WebView 上下文。 */
  getWebviewContext?: () => WebviewToolContext | undefined;
}

/**
 * 当前网页读取输入。
 */
export type ReadCurrentWebpageInput = Record<string, never>;

/**
 * 创建当前网页读取工具。
 * @param options - 工具创建选项
 * @returns 当前网页读取工具
 */
export function createBuiltinWebpageTool(options: CreateBuiltinWebpageToolOptions): AIToolExecutor<ReadCurrentWebpageInput, WebviewPageSnapshot> {
  return {
    definition: {
      name: READ_CURRENT_WEBPAGE_TOOL_NAME,
      description: '读取当前激活 WebView 网页的 URL、标题、可见文本、标题结构、链接列表和页面选中文本。',
      source: 'builtin',
      riskLevel: 'read',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    },
    async execute() {
      const context = options.getWebviewContext?.();
      if (!context) {
        return createToolFailureResult(READ_CURRENT_WEBPAGE_TOOL_NAME, 'EXECUTION_FAILED', '当前没有可读取的 WebView 页面');
      }

      try {
        const snapshot = await context.readPageSnapshot();
        return createToolSuccessResult(READ_CURRENT_WEBPAGE_TOOL_NAME, snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : '读取当前网页失败';
        return createToolFailureResult(READ_CURRENT_WEBPAGE_TOOL_NAME, 'EXECUTION_FAILED', message);
      }
    }
  };
}
