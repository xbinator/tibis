/**
 * @file use-runtime-tools.test.ts
 * @description BChat Runtime 工具动态过滤测试。
 */
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebviewToolContext } from '@/ai/tools/context/webview';
import { useRuntimeTools } from '@/components/BChat/hooks/useRuntimeTools';
import type { Message } from '@/components/BChat/utils/types';

const builtinMockState = vi.hoisted(() => {
  /**
   * 创建最小工具执行器夹具。
   * @param name - 工具名称
   * @returns 工具执行器夹具
   */
  function createExecutor(name: string): {
    definition: {
      name: string;
      description: string;
      source: 'builtin';
      riskLevel: 'read';
      parameters: { type: 'object'; properties: Record<string, unknown> };
    };
    execute: () => Promise<{ toolName: string; status: 'success'; data: null }>;
  } {
    return {
      definition: {
        name,
        description: name,
        source: 'builtin',
        riskLevel: 'read',
        parameters: { type: 'object', properties: {} }
      },
      execute: async (): Promise<{ toolName: string; status: 'success'; data: null }> => ({ toolName: name, status: 'success', data: null })
    };
  }

  return {
    createBuiltinTools: vi.fn(() => [
      createExecutor('read_current_webpage'),
      createExecutor('operate_webpage'),
      createExecutor('open_resource'),
      createExecutor('read_directory')
    ])
  };
});

const registryMockState = vi.hoisted(() => ({
  editorToolContextRegistry: {
    getCurrentContext: vi.fn(() => undefined),
    getContext: vi.fn(() => undefined)
  },
  webviewToolContextRegistry: {
    getCurrentContext: vi.fn((): unknown => undefined)
  }
}));

const storeMockState = vi.hoisted(() => ({
  skillStore: {
    initialized: false,
    getEnabledSkills: vi.fn(() => [])
  },
  toolSettingsStore: {
    hasEnabledMcpServers: false
  },
  filesStore: {
    recentFiles: [],
    getFileByPath: vi.fn(() => Promise.resolve(null))
  }
}));

const workspaceMockState = vi.hoisted(() => ({
  workspaceRoot: { value: '/workspace' },
  getWorkspaceRoot: vi.fn(() => '/workspace')
}));

vi.mock('@/ai/tools/builtin', () => ({
  createBuiltinTools: builtinMockState.createBuiltinTools,
  isBuiltinToolName: vi.fn((toolName: string): boolean =>
    ['read_current_webpage', 'operate_webpage', 'open_resource', 'read_directory', 'skill'].includes(toolName)
  ),
  OPERATE_WEBPAGE_TOOL_NAME: 'operate_webpage',
  OPEN_RESOURCE_TOOL_NAME: 'open_resource',
  READ_CURRENT_WEBPAGE_TOOL_NAME: 'read_current_webpage',
  READ_DIRECTORY_TOOL_NAME: 'read_directory',
  SKILL_TOOL_NAME: 'skill'
}));

vi.mock('@/ai/tools/builtin/SkillTool', () => ({
  createSkillTool: vi.fn()
}));

vi.mock('@/ai/tools/context/editor', () => ({
  editorToolContextRegistry: registryMockState.editorToolContextRegistry
}));

vi.mock('@/ai/tools/context/webview', () => ({
  webviewToolContextRegistry: registryMockState.webviewToolContextRegistry
}));

vi.mock('@/hooks/useOpenDraft', () => ({
  useOpenDraft: vi.fn(() => ({
    openDraft: vi.fn()
  }))
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: vi.fn(() => ({
    openFileByPath: vi.fn()
  }))
}));

vi.mock('@/hooks/useWorkspaceRoot', () => ({
  useWorkspaceRoot: vi.fn(() => workspaceMockState)
}));

vi.mock('@/shared/platform', () => ({
  native: {
    openExternal: vi.fn()
  }
}));

vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: vi.fn(() => storeMockState.skillStore)
}));

vi.mock('@/stores/ai/toolSettings', () => ({
  useToolSettingsStore: vi.fn(() => storeMockState.toolSettingsStore)
}));

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: vi.fn(() => storeMockState.filesStore)
}));

/**
 * 创建 Runtime 工具 hook。
 * @returns Runtime 工具 hook 返回值
 */
function createRuntimeTools(): ReturnType<typeof useRuntimeTools> {
  return useRuntimeTools({
    messages: ref<Message[]>([]),
    confirm: { confirm: vi.fn(async (): Promise<true> => true) },
    getSessionId: (): string => 'session-1',
    openWebview: vi.fn()
  });
}

/**
 * 获取活跃工具名称。
 * @param getActiveTools - 活跃工具读取函数
 * @returns 工具名称数组
 */
function readActiveToolNames(getActiveTools: ReturnType<typeof useRuntimeTools>['getActiveTools']): string[] {
  return getActiveTools().map((tool) => tool.definition.name);
}

describe('useRuntimeTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registryMockState.webviewToolContextRegistry.getCurrentContext.mockReturnValue(undefined);
  });

  it('only exposes WebView tools while a WebView context is active', (): void => {
    const runtimeTools = createRuntimeTools();

    expect(readActiveToolNames(runtimeTools.getActiveTools)).toEqual(expect.arrayContaining(['open_resource']));
    expect(readActiveToolNames(runtimeTools.getActiveTools)).not.toEqual(expect.arrayContaining(['read_current_webpage', 'operate_webpage']));

    const webviewContext: WebviewToolContext = {
      readPageSnapshot: vi.fn(),
      operatePage: vi.fn()
    };
    registryMockState.webviewToolContextRegistry.getCurrentContext.mockReturnValue(webviewContext);

    const activeToolNames = readActiveToolNames(runtimeTools.getActiveTools);
    expect(activeToolNames).toEqual(expect.arrayContaining(['read_current_webpage', 'operate_webpage']));
    expect(activeToolNames).not.toContain('open_resource');
  });
});
