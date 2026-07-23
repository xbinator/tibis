/**
 * @file header-tab-menu-utils.test.ts
 * @description HeaderTabMenu 资源复制动作解析测试。
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { getHeaderTabCopyAction, getWebviewUrlFromTabPath } from '@/layouts/default/utils/headerTabMenu';
import type { RecentRecord } from '@/shared/storage';
import type { Tab } from '@/stores/workspace/tabs';

/**
 * 创建测试标签页。
 * @param overrides - 标签页覆盖字段
 * @returns 测试标签页
 */
function createTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'settings',
    path: '/settings/provider',
    title: '设置',
    cacheKey: 'settings',
    ...overrides
  };
}

/**
 * 创建文件最近记录。
 * @param path - 文件真实路径
 * @returns 文件最近记录
 */
function createFileRecord(path: string | null): Extract<RecentRecord, { type: 'file' }> {
  return {
    type: 'file',
    id: 'file-a',
    url: '/editor/file-a',
    title: '复杂路径.md',
    description: path ?? '未保存文件',
    path,
    content: '',
    savedContent: '',
    name: '复杂路径',
    ext: 'md'
  };
}

/**
 * 创建 WebView 最近记录。
 * @param url - 页面 URL
 * @returns WebView 最近记录
 */
function createWebviewRecord(url: string): Extract<RecentRecord, { type: 'webview' }> {
  return {
    type: 'webview',
    id: 'web-a',
    url,
    title: 'Example'
  };
}

describe('headerTabMenu utilities', (): void => {
  it('resolves a complex document path from the matched recent record', (): void => {
    const complexPath = '/Users/demo/资料/space name/notes?# 草稿.md';
    const action = getHeaderTabCopyAction(createTab({ id: 'file-a', path: '/editor/file-a', recentKey: 'file:file-a' }), [createFileRecord(complexPath)]);

    expect(action).toEqual({
      command: 'copyPath',
      content: complexPath,
      successMessage: '已复制路径'
    });
  });

  it('does not offer copy path for an unsaved document record', (): void => {
    const action = getHeaderTabCopyAction(createTab({ id: 'file-a', path: '/editor/file-a', recentKey: 'file:file-a' }), [createFileRecord(null)]);

    expect(action).toBeNull();
  });

  it('resolves a WebView address from a matching recent record', (): void => {
    const url = 'https://example.com/docs?q=hello world#top';
    const path = `/webview/web?url=${encodeURIComponent(url)}`;
    const action = getHeaderTabCopyAction(createTab({ id: path, path, title: 'Example' }), [createWebviewRecord(url)]);

    expect(action).toEqual({
      command: 'copyAddress',
      content: url,
      successMessage: '已复制地址'
    });
  });

  it('falls back to the decoded WebView route URL when recent records are missing', (): void => {
    const url = 'https://example.test/a path/?q=中文#section';
    const path = `/webview/native?url=${encodeURIComponent(url)}`;

    expect(getWebviewUrlFromTabPath(path)).toBe(url);
    expect(getHeaderTabCopyAction(createTab({ id: path, path, title: 'Example' }), [])).toEqual({
      command: 'copyAddress',
      content: url,
      successMessage: '已复制地址'
    });
  });

  it('does not offer resource copy actions for non-file and non-WebView tabs', (): void => {
    expect(getHeaderTabCopyAction(createTab(), [createFileRecord('/tmp/a.md')])).toBeNull();
  });
});
