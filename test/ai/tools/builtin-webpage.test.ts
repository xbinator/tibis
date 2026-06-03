import { describe, expect, it } from 'vitest';
import { createBuiltinWebpageTool, READ_CURRENT_WEBPAGE_TOOL_NAME } from '@/ai/tools/builtin/WebpageTool';
import type { WebviewToolContext } from '@/ai/tools/context/webview';

/**
 * 创建测试用 WebView 上下文。
 * @returns WebView 上下文
 */
function createContext(): WebviewToolContext {
  return {
    readPageSnapshot: async () => ({
      url: 'https://example.com',
      title: 'Example',
      text: 'Visible text',
      selectedText: 'Selected',
      headings: [{ level: 1, text: 'Heading' }],
      links: [{ text: 'Docs', href: 'https://example.com/docs' }],
      capturedAt: 1,
      truncated: {
        text: false,
        headings: false,
        links: false,
        selectedText: false
      }
    })
  };
}

describe('read_current_webpage tool', () => {
  it('returns failure when no WebView context exists', async () => {
    const tool = createBuiltinWebpageTool({ getWebviewContext: () => undefined });
    const result = await tool.execute({});

    expect(result.status).toBe('failure');
    expect(result.error?.message).toContain('当前没有可读取的 WebView 页面');
  });

  it('returns current webpage snapshot', async () => {
    const tool = createBuiltinWebpageTool({ getWebviewContext: () => createContext() });
    const result = await tool.execute({});

    expect(result.status).toBe('success');
    expect(result.toolName).toBe(READ_CURRENT_WEBPAGE_TOOL_NAME);
    expect(result.data).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      text: 'Visible text',
      selectedText: 'Selected'
    });
  });

  it('maps page read errors to tool failure', async () => {
    const tool = createBuiltinWebpageTool({
      getWebviewContext: () => ({
        readPageSnapshot: async () => {
          throw new Error('页面读取超时');
        }
      })
    });
    const result = await tool.execute({});

    expect(result.status).toBe('failure');
    expect(result.error?.message).toBe('页面读取超时');
  });
});
