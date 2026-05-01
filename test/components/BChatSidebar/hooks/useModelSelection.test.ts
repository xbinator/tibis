/**
 * @file useModelSelection.test.ts
 * @description 验证模型选择 hook 的 computed 派生逻辑和 store 委托
 */
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Module-level reactive state（getter 延迟访问，mock 工厂执行时不需要已初始化）
let serviceModelState: ReturnType<typeof createServiceModelState>;
let providerState: ReturnType<typeof createProviderState>;

/** 模型项精简类型 */
interface TestModel {
  id: string;
  name: string;
  supportsVision?: boolean;
}

/** 服务商精简类型 */
interface TestProvider {
  id: string;
  name: string;
  models?: TestModel[];
}

function createServiceModelState() {
  return reactive({
    chatModel: undefined as { providerId: string; modelId: string } | undefined
  });
}

function createProviderState() {
  return reactive({
    providers: [] as TestProvider[]
  });
}

const loadChatModelMock = vi.fn();
const setChatModelMock = vi.fn();

vi.mock('@/stores/service-model', () => ({
  useServiceModelStore: () => ({
    get chatModel() { return serviceModelState?.chatModel; },
    loadChatModel: loadChatModelMock,
    setChatModel: setChatModelMock
  })
}));

vi.mock('@/stores/provider', () => ({
  useProviderStore: () => ({
    get providers() { return providerState?.providers ?? []; }
  })
}));

describe('useModelSelection', () => {
  beforeEach(async () => {
    vi.resetModules();
    serviceModelState = createServiceModelState();
    providerState = createProviderState();
    loadChatModelMock.mockReset();
    setChatModelMock.mockReset();
  });

  describe('supportsVision — 静态场景', () => {
    it('无选中模型时返回 false', async () => {
      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { supportsVision } = useModelSelection();
      expect(supportsVision.value).toBe(false);
    });

    it('选中模型声明 supportsVision 时返回 true', async () => {
      serviceModelState.chatModel = { providerId: 'openai', modelId: 'gpt-4' };
      providerState.providers = [
        { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-4', name: 'GPT-4', supportsVision: true }] }
      ];

      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { supportsVision } = useModelSelection();
      expect(supportsVision.value).toBe(true);
    });

    it('选中模型未声明 supportsVision 时返回 false', async () => {
      serviceModelState.chatModel = { providerId: 'openai', modelId: 'gpt-basic' };
      providerState.providers = [
        { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-basic', name: 'GPT Basic', supportsVision: false }] }
      ];

      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { supportsVision } = useModelSelection();
      expect(supportsVision.value).toBe(false);
    });

    it('服务商不存在时返回 false', async () => {
      serviceModelState.chatModel = { providerId: 'missing', modelId: 'gpt-4' };
      providerState.providers = [
        { id: 'openai', name: 'OpenAI', models: [] }
      ];

      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { supportsVision } = useModelSelection();
      expect(supportsVision.value).toBe(false);
    });

    it('模型不在服务商列表中时返回 false', async () => {
      serviceModelState.chatModel = { providerId: 'openai', modelId: 'nonexistent' };
      providerState.providers = [
        { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-4', name: 'GPT-4', supportsVision: true }] }
      ];

      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { supportsVision } = useModelSelection();
      expect(supportsVision.value).toBe(false);
    });
  });

  describe('supportsVision — 响应式场景', () => {
    it('切换模型后 computed 自动更新', async () => {
      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { supportsVision } = useModelSelection();

      // 初始无模型
      expect(supportsVision.value).toBe(false);

      // 设置服务商和模型
      providerState.providers = [
        { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-4', name: 'GPT-4', supportsVision: true }] }
      ];
      serviceModelState.chatModel = { providerId: 'openai', modelId: 'gpt-4' };

      // computed 同步更新
      expect(supportsVision.value).toBe(true);

      // 切换到不支持视觉的模型
      providerState.providers[0].models = [
        { id: 'gpt-4', name: 'GPT-4', supportsVision: true },
        { id: 'gpt-basic', name: 'GPT Basic', supportsVision: false }
      ];
      serviceModelState.chatModel = { providerId: 'openai', modelId: 'gpt-basic' };

      expect(supportsVision.value).toBe(false);
    });

    it('编辑模型能力后 computed 自动更新（核心场景）', async () => {
      serviceModelState.chatModel = { providerId: 'openai', modelId: 'gpt-4' };
      providerState.providers = [
        { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-4', name: 'GPT-4', supportsVision: false }] }
      ];

      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { supportsVision } = useModelSelection();

      expect(supportsVision.value).toBe(false);

      // 模拟 ModelModal 编辑：更新 providerStore 中的模型字段
      providerState.providers[0].models = [{ id: 'gpt-4', name: 'GPT-4', supportsVision: true }];

      expect(supportsVision.value).toBe(true);
    });
  });

  describe('selectedModel', () => {
    it('代理 store 的 chatModel', async () => {
      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { selectedModel } = useModelSelection();

      expect(selectedModel.value).toBeUndefined();

      serviceModelState.chatModel = { providerId: 'deepseek', modelId: 'v4' };

      expect(selectedModel.value).toEqual({ providerId: 'deepseek', modelId: 'v4' });
    });
  });

  describe('loadSelectedModel', () => {
    it('委托给 store.loadChatModel', async () => {
      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { loadSelectedModel } = useModelSelection();

      await loadSelectedModel();

      expect(loadChatModelMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModelChange', () => {
    it('委托给 store.setChatModel', async () => {
      const { useModelSelection } = await import('@/components/BChatSidebar/hooks/useModelSelection');
      const { onModelChange } = useModelSelection();

      await onModelChange({ providerId: 'openai', modelId: 'gpt-4' });

      expect(setChatModelMock).toHaveBeenCalledWith({ providerId: 'openai', modelId: 'gpt-4' });
      expect(setChatModelMock).toHaveBeenCalledTimes(1);
    });
  });
});
