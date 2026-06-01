/**
 * @file useChatStream.memory.test.ts
 * @description 校验聊天流首次发送前会加载本地记忆并注入 system prompt。
 */
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStream } from '@/components/BChatSidebar/hooks/useChatStream';
import { create } from '@/components/BChatSidebar/utils/messageHelper';
import type { ServiceConfig } from '@/components/BChatSidebar/utils/types';

/** 模拟 localStorage，供记忆开关初始化使用 */
const mockLocalStorage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
  removeItem: (key: string) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear()
});

/** 模拟本地记忆文件系统 */
const mockNativeFiles = new Map<string, { content: string }>();
const mockHomeDir = '/mock/home';
const streamSpy = vi.fn();

vi.mock('@/hooks/useChat', () => ({
  /**
   * 模拟底层聊天流 Hook，捕获 stream 入参。
   * @param _options - hook 回调配置
   * @returns 模拟聊天代理
   */
  useChat: () => ({
    agent: {
      invoke: vi.fn(),
      stream: streamSpy,
      abort: vi.fn()
    }
  })
}));

vi.mock('@/components/BChatSidebar/utils/compression/coordinator', () => ({
  /**
   * 模拟压缩协调器，避免测试触发真实压缩流程。
   * @returns 压缩协调器桩
   */
  createCompressionCoordinator: () => ({
    compressSessionManually: vi.fn()
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    getHomeDir: vi.fn(async () => mockHomeDir),
    getPathStatus: vi.fn(async (filePath: string) => ({
      exists: mockNativeFiles.has(filePath),
      isFile: mockNativeFiles.has(filePath),
      isDirectory: false
    })),
    readFile: vi.fn(async (filePath: string) => {
      const file = mockNativeFiles.get(filePath);
      if (!file) throw new Error(`ENOENT: ${filePath}`);
      return { content: file.content };
    }),
    onShellCommandOutput: vi.fn(() => () => undefined)
  }
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  /**
   * 模拟服务模型 store，当前用例直接传入配置，不需要解析服务配置。
   * @returns 服务模型 store 桩
   */
  useServiceModelStore: () => ({
    getAvailableServiceConfig: vi.fn()
  })
}));

vi.mock('@/stores/ai/toolSettings', () => ({
  /**
   * 模拟工具设置 store，关闭 Tavily 与 MCP。
   * @returns 工具设置 store 桩
   */
  useToolSettingsStore: () => ({
    tavily: {
      enabled: false,
      apiKey: '',
      searchDefaults: {
        searchDepth: 'basic',
        topic: 'general',
        timeRange: null,
        country: 'china',
        maxResults: 5,
        includeAnswer: true,
        includeImages: false,
        includeDomains: [],
        excludeDomains: []
      },
      extractDefaults: {
        extractDepth: 'basic',
        format: 'markdown',
        includeImages: false
      }
    },
    mcp: {
      servers: []
    }
  })
}));

describe('useChatStream memory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockLocalStorage.clear();
    mockNativeFiles.clear();
    streamSpy.mockClear();
  });

  it('loads memory before streaming the first chat message', async () => {
    mockNativeFiles.set(`${mockHomeDir}/.tibis/MEMORY.md`, {
      content: '# User Memory\n\n## Facts\n- 喜欢简洁回答\n'
    });
    const messages = ref([create.userMessage('记得我的偏好吗')]);
    const { stream } = useChatStream({
      messages,
      getSessionId: () => 'session-1'
    });
    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: false
      }
    };

    await stream.streamMessages(messages.value, config);

    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('喜欢简洁回答')
      })
    );
  });
});
