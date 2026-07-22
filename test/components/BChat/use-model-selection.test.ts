/**
 * @file use-model-selection.test.ts
 * @description BChat 模型选择状态可用性派生测试。
 * @vitest-environment jsdom
 */
import type { AIProvider } from 'types/ai';
import type { ChatSession } from 'types/chat';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelSelection } from '@/components/BChat/hooks/useModelSelection';
import { useProviderStore } from '@/stores/ai/provider';
import { useServiceModelStore } from '@/stores/ai/serviceModel';
import { useChatSessionStore } from '@/stores/chat/session';

/**
 * 可由测试显式完成的异步任务。
 */
interface Deferred<T> {
  /** 等待中的 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T | PromiseLike<T>) => void;
}

/**
 * 创建可控异步任务。
 * @returns Promise 及其完成函数
 */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve): void => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

/**
 * 创建带可选模型元数据的测试会话。
 * @param id - 会话 ID
 * @param modelId - 会话模型 ID
 * @returns 测试会话
 */
function createSession(id: string, modelId?: string): ChatSession {
  return {
    id,
    type: 'assistant',
    title: id,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    lastMessageAt: '2026-07-22T00:00:00.000Z',
    metadata: modelId ? { model: { providerId: 'provider-1', modelId } } : undefined
  };
}

/**
 * 创建包含多个可切换模型的服务商测试数据。
 * @param options - 可用性配置
 * @returns AI 服务商配置
 */
function createProvider(options: { providerEnabled: boolean; disabledModelIds?: string[] }): AIProvider {
  const disabledModelIds = new Set(options.disabledModelIds ?? []);
  return {
    id: 'provider-1',
    name: 'Provider 1',
    description: 'Provider for tests',
    type: 'openai',
    isEnabled: options.providerEnabled,
    models: [
      {
        id: 'model-1',
        name: 'Model 1',
        type: 'chat',
        isEnabled: !disabledModelIds.has('model-1'),
        contextWindow: 128000,
        supportsVision: true
      },
      {
        id: 'model-2',
        name: 'Model 2',
        type: 'chat',
        isEnabled: !disabledModelIds.has('model-2'),
        contextWindow: 64000,
        supportsVision: false
      },
      {
        id: 'model-3',
        name: 'Model 3',
        type: 'chat',
        isEnabled: !disabledModelIds.has('model-3'),
        contextWindow: 32000,
        supportsVision: false
      }
    ]
  };
}

describe('useModelSelection', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('does not expose selectedModel when the provider is disabled', (): void => {
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: false })];

    const modelSelection = useModelSelection(ref<string | null>(null));

    expect(modelSelection.selectedModel.value).toBeUndefined();
    expect(modelSelection.supportsVision.value).toBe(false);
  });

  it('does not expose selectedModel when the model is disabled', (): void => {
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true, disabledModelIds: ['model-1'] })];

    const modelSelection = useModelSelection(ref<string | null>(null));

    expect(modelSelection.selectedModel.value).toBeUndefined();
    expect(modelSelection.supportsVision.value).toBe(false);
  });

  it('exposes selectedModel when the provider and model are enabled', (): void => {
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true })];

    const modelSelection = useModelSelection(ref<string | null>(null));

    expect(modelSelection.selectedModel.value).toEqual({ providerId: 'provider-1', modelId: 'model-1' });
    expect(modelSelection.supportsVision.value).toBe(true);
    expect(modelSelection.contextWindow.value).toBe(128000);
  });

  it('persists model changes only while no session is active', async (): Promise<void> => {
    const activeSessionId = ref<string | null>(null);
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true })];
    const setChatModel = vi.spyOn(serviceModelStore, 'setChatModel').mockImplementation(async (model): Promise<void> => {
      serviceModelStore.chatModel = model;
    });
    const modelSelection = useModelSelection(activeSessionId);

    await modelSelection.onModelChange({ providerId: 'provider-1', modelId: 'model-2' });

    expect(setChatModel).toHaveBeenCalledOnce();
    expect(serviceModelStore.chatModel).toEqual({ providerId: 'provider-1', modelId: 'model-2' });
  });

  it('keeps existing-session model changes out of the service model store', async (): Promise<void> => {
    const activeSessionId = ref<string | null>('session-1');
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    const chatSessionStore = useChatSessionStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true })];
    chatSessionStore.sessions = [createSession('session-1', 'model-1')];
    const setChatModel = vi.spyOn(serviceModelStore, 'setChatModel');
    const updateSessionModel = vi.spyOn(chatSessionStore, 'updateSessionModel').mockImplementation(async (sessionId, model): Promise<ChatSession> => {
      const session = createSession(sessionId, model.modelId);
      chatSessionStore.sessions = [session];
      return session;
    });
    const modelSelection = useModelSelection(activeSessionId);

    await modelSelection.onModelChange({ providerId: 'provider-1', modelId: 'model-2' });

    expect(setChatModel).not.toHaveBeenCalled();
    expect(updateSessionModel).toHaveBeenCalledWith('session-1', { providerId: 'provider-1', modelId: 'model-2' });
    expect(serviceModelStore.chatModel).toEqual({ providerId: 'provider-1', modelId: 'model-1' });
    expect(modelSelection.selectedModel.value).toEqual({ providerId: 'provider-1', modelId: 'model-2' });
    expect(modelSelection.contextWindow.value).toBe(64000);
    expect(modelSelection.supportsVision.value).toBe(false);
  });

  it('restores persisted model choices by session and returns to the global draft model', async (): Promise<void> => {
    const activeSessionId = ref<string | null>('session-1');
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    const chatSessionStore = useChatSessionStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true })];
    chatSessionStore.sessions = [createSession('session-1', 'model-2'), createSession('session-2', 'model-3')];
    const modelSelection = useModelSelection(activeSessionId);

    activeSessionId.value = 'session-2';
    expect(modelSelection.selectedModel.value?.modelId).toBe('model-3');

    activeSessionId.value = 'session-1';
    expect(modelSelection.selectedModel.value?.modelId).toBe('model-2');

    activeSessionId.value = null;
    expect(modelSelection.selectedModel.value?.modelId).toBe('model-1');
  });

  it('keeps the persisted selection when a session model update fails', async (): Promise<void> => {
    const activeSessionId = ref<string | null>('session-1');
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    const chatSessionStore = useChatSessionStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-3' };
    providerStore.providers = [createProvider({ providerEnabled: true })];
    chatSessionStore.sessions = [createSession('session-1', 'model-1')];
    vi.spyOn(chatSessionStore, 'updateSessionModel').mockRejectedValue(new Error('metadata failed'));
    const modelSelection = useModelSelection(activeSessionId);

    await expect(modelSelection.onModelChange({ providerId: 'provider-1', modelId: 'model-2' })).rejects.toThrow('metadata failed');

    expect(modelSelection.selectedModel.value).toEqual({ providerId: 'provider-1', modelId: 'model-1' });
  });

  it('loads a directly opened session before resolving its selected model', async (): Promise<void> => {
    const activeSessionId = ref<string | null>('session-old');
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    const chatSessionStore = useChatSessionStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true })];
    vi.spyOn(serviceModelStore, 'loadChatModel').mockResolvedValue();
    vi.spyOn(providerStore, 'loadProviders').mockResolvedValue();
    const loadSessionById = vi.spyOn(chatSessionStore, 'loadSessionById').mockImplementation(async (): Promise<ChatSession> => {
      const session = createSession('session-old', 'model-2');
      chatSessionStore.sessions = [session];
      return session;
    });
    const modelSelection = useModelSelection(activeSessionId);

    await expect(modelSelection.resolveSelectedModel()).resolves.toEqual({ providerId: 'provider-1', modelId: 'model-2' });
    expect(loadSessionById).toHaveBeenCalledWith('session-old');
  });

  it('waits for the default model and providers before resolving a draft runtime model', async (): Promise<void> => {
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    const modelLoad = createDeferred<void>();
    const providerLoad = createDeferred<void>();
    const loadChatModel = vi.spyOn(serviceModelStore, 'loadChatModel').mockImplementation(async (): Promise<void> => {
      await modelLoad.promise;
      serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    });
    const loadProviders = vi.spyOn(providerStore, 'loadProviders').mockImplementation(async (): Promise<void> => {
      await providerLoad.promise;
      providerStore.providers = [createProvider({ providerEnabled: true })];
    });
    const modelSelection = useModelSelection(ref<string | null>(null));
    let resolved = false;

    const resultPromise = modelSelection.resolveSelectedModel().finally((): void => {
      resolved = true;
    });
    await Promise.resolve();

    expect(loadChatModel).toHaveBeenCalledOnce();
    expect(loadProviders).toHaveBeenCalledOnce();
    expect(resolved).toBe(false);

    modelLoad.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    providerLoad.resolve();
    await expect(resultPromise).resolves.toEqual({ providerId: 'provider-1', modelId: 'model-1' });
  });
});
