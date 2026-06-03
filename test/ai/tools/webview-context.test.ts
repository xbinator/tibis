import { describe, expect, it } from 'vitest';
import { createWebviewToolContextRegistry, type WebviewToolContext } from '@/ai/tools/context/webview';

/**
 * 创建测试用 WebView 工具上下文。
 * @param url - 页面 URL
 * @returns WebView 工具上下文
 */
function createContext(url: string): WebviewToolContext {
  return {
    readPageSnapshot: async () => ({
      url,
      title: `Title ${url}`,
      text: `Text ${url}`,
      selectedText: '',
      headings: [],
      links: [],
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

describe('webview tool context registry', () => {
  it('returns undefined when no current WebView exists', () => {
    const registry = createWebviewToolContextRegistry();

    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('returns the explicitly current context', async () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.register('tab-2', createContext('https://two.example'));
    registry.setCurrent('tab-1');

    await expect(registry.getCurrentContext()?.readPageSnapshot()).resolves.toMatchObject({
      url: 'https://one.example'
    });
  });

  it('does not switch current context on register alone', async () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.setCurrent('tab-1');
    registry.register('tab-2', createContext('https://two.example'));

    await expect(registry.getCurrentContext()?.readPageSnapshot()).resolves.toMatchObject({
      url: 'https://one.example'
    });
  });

  it('clears only the matching current context', () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.register('tab-2', createContext('https://two.example'));
    registry.setCurrent('tab-1');
    registry.clearCurrent('tab-2');

    expect(registry.getCurrentContext()).toBeDefined();

    registry.clearCurrent('tab-1');

    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('unregister removes the current context', () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.setCurrent('tab-1');
    registry.unregister('tab-1');

    expect(registry.getCurrentContext()).toBeUndefined();
  });
});
