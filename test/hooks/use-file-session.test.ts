/**
 * @file use-file-session.test.ts
 * @description 验证通用文件会话和 .tibis 容器工具。
 */
import { effectScope, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingData } from '@/components/BDrawing/types';
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';
import { createTibisDocumentContent, parseTibisDocumentContent, resolveTibisDocumentRoute, useFileSession } from '@/hooks/useFileSession';
import type { FileChangeEvent } from '@/shared/platform/native/types';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const clearDirtyMock = vi.hoisted(() => vi.fn());
const setDirtyMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const saveFileMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const onFileChangedMock = vi.hoisted(() => vi.fn());
const registerWatchMock = vi.hoisted(() => vi.fn());
const unregisterWatchMock = vi.hoisted(() => vi.fn());
const updateWatchPathMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    getFileById: getFileByIdMock,
    addFile: addFileMock,
    updateFile: updateFileMock,
    removeFile: vi.fn()
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    clearDirty: clearDirtyMock,
    setDirty: setDirtyMock,
    isDirty: () => false,
    clearMissing: vi.fn(),
    isMissing: () => false
  })
}));

vi.mock('@/stores/editor/fileWatch', () => ({
  useEditorFileWatchStore: () => ({
    register: registerWatchMock,
    unregister: unregisterWatchMock,
    updatePath: updateWatchPathMock
  })
}));

vi.mock('@/stores/editor/preferences', () => ({
  useEditorPreferencesStore: () => ({
    saveStrategy: 'off'
  })
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn().mockResolvedValue([true, false]),
    input: vi.fn().mockResolvedValue([true, ''])
  }
}));

vi.mock('@/shared/platform', () => ({
  native: {
    writeFile: writeFileMock,
    saveFile: saveFileMock,
    readFile: readFileMock,
    renameFile: vi.fn(),
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn(),
    onFileChanged: onFileChangedMock
  }
}));

/**
 * 创建测试画图数据。
 * @returns 画图数据
 */
function createDrawingData(): DrawingData {
  return createDefaultDrawingData();
}

/**
 * 等待挂起的 Promise 任务完成。
 * @returns Promise
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('tibis document helpers', (): void => {
  it('serializes drawing data as flat top-level tibis JSON', (): void => {
    const content = createTibisDocumentContent({
      type: 'drawing',
      version: 1,
      data: createDrawingData()
    });

    expect(JSON.parse(content)).toEqual({
      type: 'drawing',
      version: 1,
      name: '',
      description: '',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      outputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      metadata: {},
      elements: [],
      viewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      }
    });
  });

  it('parses flat tibis JSON and strips type and version from data', (): void => {
    const parsed = parseTibisDocumentContent<DrawingData>(
      JSON.stringify({
        type: 'drawing',
        version: 1,
        metadata: {},
        elements: [],
        viewport: {
          center: { x: 1, y: 2 },
          zoom: 1.5
        }
      })
    );

    expect(parsed.supported).toBe(true);
    expect(parsed.type).toBe('drawing');
    expect(parsed.version).toBe(1);
    expect(parsed.data).toEqual({
      metadata: {},
      elements: [],
      viewport: {
        center: { x: 1, y: 2 },
        zoom: 1.5
      }
    });
  });

  it('checks tibis support against the requested type and version', (): void => {
    const parsed = parseTibisDocumentContent<Record<string, unknown>>(
      JSON.stringify({
        type: 'workflow',
        version: 1,
        nodes: []
      }),
      { type: 'workflow', version: 1 }
    );

    expect(parsed.supported).toBe(true);
    expect(parsed.data).toEqual({
      nodes: []
    });
  });

  it('routes supported drawing documents to drawing and invalid content to editor', (): void => {
    expect(resolveTibisDocumentRoute('{"type":"drawing","version":1,"elements":[],"viewport":{"center":{"x":0,"y":0},"zoom":1}}')).toEqual({
      routeName: 'drawing'
    });

    expect(resolveTibisDocumentRoute('{broken')).toEqual({
      routeName: 'editor'
    });
  });
});

describe('useFileSession', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    addFileMock.mockReset();
    updateFileMock.mockReset();
    clearDirtyMock.mockReset();
    setDirtyMock.mockReset();
    writeFileMock.mockReset();
    saveFileMock.mockReset();
    readFileMock.mockReset();
    onFileChangedMock.mockReset();
    registerWatchMock.mockReset();
    unregisterWatchMock.mockReset();
    updateWatchPathMock.mockReset();
    routerPushMock.mockReset();
    onFileChangedMock.mockReturnValue(vi.fn());
  });

  it('creates default drawing tibis content when no stored file exists', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    addFileMock.mockResolvedValue(undefined);
    const scope = effectScope();
    const fileId = ref('drawing-1');
    let content = '';

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<DrawingData>({
        fileId,
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      content = session.fileState.value.content;
    });
    scope.stop();

    expect(JSON.parse(content)).toEqual({
      type: 'drawing',
      version: 1,
      name: '',
      description: '',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      outputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      metadata: {},
      elements: [],
      viewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      }
    });
  });

  it('writes to existing disk path on save', async (): Promise<void> => {
    const content = createTibisDocumentContent({ type: 'drawing', version: 1, data: createDrawingData() });
    getFileByIdMock.mockResolvedValue({
      type: 'file',
      id: 'drawing-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content,
      savedContent: content
    });
    writeFileMock.mockResolvedValue(undefined);
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<DrawingData>({
        fileId: ref('drawing-1'),
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await session.actions.onSave();
    });
    scope.stop();

    expect(writeFileMock).toHaveBeenCalledWith('/tmp/board.tibis', content);
  });

  it('does not mark stored tibis content dirty while loading', async (): Promise<void> => {
    const content = '{"type":"drawing","version":1,"elements":[],"viewport":{"center":{"x":0,"y":0},"zoom":1}}';
    getFileByIdMock.mockResolvedValue({
      type: 'file',
      id: 'drawing-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content,
      savedContent: content
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<DrawingData>({
        fileId: ref('drawing-1'),
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await flushPromises();
    });
    scope.stop();

    expect(setDirtyMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uses tibis save filter when saving with dialog', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    addFileMock.mockResolvedValue(undefined);
    saveFileMock.mockResolvedValue('/tmp/board.tibis');
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<DrawingData>({
        fileId: ref('drawing-1'),
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await session.actions.onSaveAs();
    });
    scope.stop();

    expect(saveFileMock).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({
        defaultPath: 'Untitled.tibis',
        filters: [{ name: 'Tibis', extensions: ['tibis'] }]
      })
    );
  });

  it('syncs text mode data changes into file content', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    addFileMock.mockResolvedValue(undefined);
    const scope = effectScope();
    let content = '';

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<string>({
        fileId: ref('text-1'),
        kind: 'text',
        defaultName: 'Untitled',
        defaultExt: 'md',
        defaultData: '',
        routeName: 'editor',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      session.data.value = 'hello';
      await nextTick();
      content = session.fileState.value.content;
    });
    scope.stop();

    expect(content).toBe('hello');
  });

  it('registers disk paths for missing file tracking', async (): Promise<void> => {
    const content = createTibisDocumentContent({ type: 'drawing', version: 1, data: createDrawingData() });
    getFileByIdMock.mockResolvedValue({
      type: 'file',
      id: 'drawing-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content,
      savedContent: content
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<DrawingData>({
        fileId: ref('drawing-1'),
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
    });
    scope.stop();

    expect(registerWatchMock).toHaveBeenCalledWith('drawing-1', '/tmp/board.tibis');
  });

  it('routes to fallback when an external change makes tibis content unsupported', async (): Promise<void> => {
    const content = createTibisDocumentContent({ type: 'drawing', version: 1, data: createDrawingData() });
    let fileChangedHandler: ((event: FileChangeEvent) => void) | null = null;
    onFileChangedMock.mockImplementation((handler: (event: FileChangeEvent) => void): (() => void) => {
      fileChangedHandler = handler;
      return vi.fn();
    });
    getFileByIdMock.mockResolvedValue({
      type: 'file',
      id: 'drawing-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content,
      savedContent: content
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<DrawingData>({
        fileId: ref('drawing-1'),
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      fileChangedHandler?.({
        type: 'change',
        filePath: '/tmp/board.tibis',
        content: '{"type":"workflow","version":1}'
      });
      await flushPromises();
    });
    scope.stop();

    expect(updateFileMock).toHaveBeenCalledWith(
      'drawing-1',
      expect.objectContaining({
        content: '{"type":"workflow","version":1}'
      })
    );
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'editor', params: { id: 'drawing-1' } });
  });

  it('does not write disk when tibis serialization fails', async (): Promise<void> => {
    const content = createTibisDocumentContent({ type: 'drawing', version: 1, data: createDrawingData() });
    getFileByIdMock.mockResolvedValue({
      type: 'file',
      id: 'drawing-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content,
      savedContent: content
    });
    const scope = effectScope();
    const circular = createDrawingData() as DrawingData & { self?: unknown };
    circular.self = circular;

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<DrawingData>({
        fileId: ref('drawing-1'),
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      session.data.value = circular;
      await nextTick();
      await session.actions.onSave();
    });
    scope.stop();

    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
