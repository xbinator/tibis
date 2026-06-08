/**
 * @file drop-zone.test.ts
 * @description 验证欢迎页拖拽文件时使用原生路径打开本地文件。
 * @vitest-environment jsdom
 */
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DropZone from '@/views/welcome/components/DropZone.vue';

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
const getPathForFileMock = vi.hoisted(() => vi.fn<(_file: File) => string | null>().mockReturnValue('/tmp/dropped.md'));
const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
const createAndOpenMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
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
      files: createFileList(file)
    }
  });

  return event;
}

describe('DropZone', () => {
  beforeEach((): void => {
    openFileByPathMock.mockClear();
    getPathForFileMock.mockClear();
    routerPushMock.mockClear();
    createAndOpenMock.mockClear();
    getPathForFileMock.mockReturnValue('/tmp/dropped.md');
  });

  it('opens dropped local file by the native file path resolver', async (): Promise<void> => {
    const wrapper = shallowMount(DropZone, {
      slots: {
        default: '<div>content</div>'
      }
    });

    await wrapper.element.dispatchEvent(createDropEvent(new File(['hello'], 'dropped.md', { type: 'text/markdown' })));

    expect(getPathForFileMock).toHaveBeenCalledTimes(1);
    expect(openFileByPathMock).toHaveBeenCalledWith('/tmp/dropped.md');
  });
});
