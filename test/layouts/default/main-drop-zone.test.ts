/**
 * @file main-drop-zone.test.ts
 * @description 验证默认布局主内容区拖拽文件时使用原生路径打开本地文件。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MainDropZone from '@/layouts/default/components/MainDropZone.vue';

/**
 * 测试用 FileList 最小实现。
 */
interface TestFileList {
  /** 文件数量。 */
  length: number;
  /** 第一个文件。 */
  0: File;
  /** 按索引读取文件。 */
  item: (index: number) => File | null;
}

const openFileByPathMock = vi.hoisted(() => vi.fn<(_path: string) => Promise<unknown>>().mockResolvedValue({ id: 'opened-file' }));
const openFileMock = vi.hoisted(() => vi.fn<(_file: unknown) => Promise<unknown>>().mockResolvedValue({ id: 'opened-file' }));
const getPathForFileMock = vi.hoisted(() => vi.fn<(_file: File) => string | null>().mockReturnValue('/tmp/dropped.md'));
const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
const createAndOpenMock = vi.hoisted(() => vi.fn());

/**
 * 读取 MainDropZone 组件源码。
 * @returns MainDropZone.vue 文件内容
 */
function readMainDropZoneSource(): string {
  return readFileSync(resolvePath(process.cwd(), 'src/layouts/default/components/MainDropZone.vue'), 'utf8');
}

/**
 * 从 Vue 组件源码中提取指定样式规则内容。
 * @param source - Vue 组件源码
 * @param selector - 需要匹配的 CSS 选择器
 * @returns 样式规则内容；未命中时返回空字符串
 */
function extractStyleRuleBody(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`).exec(source);
  return rule?.groups?.body ?? '';
}

/**
 * 从样式规则中提取 z-index 数值。
 * @param ruleBody - CSS 规则内容
 * @returns z-index 数值；未命中时返回 null
 */
function extractZIndex(ruleBody: string): number | null {
  const zIndexMatch = /z-index:\s*(?<value>\d+);/.exec(ruleBody);
  if (!zIndexMatch?.groups?.value) return null;

  return Number(zIndexMatch.groups.value);
}

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    openFile: openFileMock,
    openFileByPath: openFileByPathMock
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    getPathForFile: getPathForFileMock
  }
}));

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    createAndOpen: createAndOpenMock
  })
}));

/**
 * 创建拖拽文件列表。
 * @param file - 被拖拽的文件对象
 * @returns 测试文件列表
 */
function createFileList(file: File): TestFileList {
  return {
    0: file,
    length: 1,
    item: (index: number): File | null => (index === 0 ? file : null)
  };
}

/**
 * 创建包含文件的 drop 事件。
 * @param file - 被拖拽的文件对象
 * @returns drop 事件
 */
function createDropEvent(file: File): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });

  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files: createFileList(file),
      types: ['Files']
    }
  });

  return event;
}

/**
 * 等待异步拖拽处理完成。
 * @returns Promise
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('MainDropZone', () => {
  it('keeps the drag overlay above editor selection panels', (): void => {
    const source = readMainDropZoneSource();
    const overlayRuleBody = extractStyleRuleBody(source, '.main-drop-zone__overlay');
    const overlayZIndex = extractZIndex(overlayRuleBody);

    expect(overlayZIndex).not.toBeNull();
    expect(overlayZIndex).toBeGreaterThan(1000);
  });

  beforeEach((): void => {
    openFileByPathMock.mockClear();
    openFileMock.mockClear();
    getPathForFileMock.mockClear();
    routerPushMock.mockClear();
    createAndOpenMock.mockClear();
    getPathForFileMock.mockReturnValue('/tmp/dropped.md');
  });

  it('opens dropped local file by the native file path resolver', async (): Promise<void> => {
    const wrapper = shallowMount(MainDropZone, {
      slots: {
        default: '<div>content</div>'
      }
    });

    await wrapper.element.dispatchEvent(createDropEvent(new File(['hello'], 'dropped.md', { type: 'text/markdown' })));

    expect(getPathForFileMock).toHaveBeenCalledTimes(1);
    expect(openFileByPathMock).toHaveBeenCalledWith('/tmp/dropped.md');
  });

  it('ignores dropped tibis files because widget sessions use json records', async (): Promise<void> => {
    getPathForFileMock.mockReturnValue(null);

    const wrapper = shallowMount(MainDropZone, {
      slots: {
        default: '<div>content</div>'
      }
    });

    await wrapper.element.dispatchEvent(createDropEvent(new File(['{"type":"widget","version":1}'], 'board.tibis', { type: 'application/json' })));
    await flushPromises();

    expect(createAndOpenMock).not.toHaveBeenCalled();
    expect(openFileMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
