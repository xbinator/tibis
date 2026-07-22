/**
 * @file useModelSelection.ts
 * @description 模型选择状态管理 hook，草稿模型写入全局配置，已有会话模型持久化到会话元数据。
 */
import type { AIProviderModel } from 'types/ai';
import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import { useProviderStore } from '@/stores/ai/provider';
import type { SelectedModel } from '@/stores/ai/serviceModel';
import { useServiceModelStore } from '@/stores/ai/serviceModel';
import { useChatSessionStore } from '@/stores/chat/session';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 模型选择 hook 返回值。
 */
interface UseModelSelectionReturn {
  /** 当前可用模型。 */
  selectedModel: ComputedRef<SelectedModel | undefined>;
  /** 当前模型是否支持视觉输入。 */
  supportsVision: ComputedRef<boolean>;
  /** 当前模型上下文窗口。 */
  contextWindow: ComputedRef<number>;
  /** 加载全局 chat 默认模型。 */
  loadSelectedModel: () => Promise<void>;
  /** 加载会话元数据后解析当前可用模型。 */
  resolveSelectedModel: () => Promise<SelectedModel | undefined>;
  /** 切换当前草稿或会话模型。 */
  onModelChange: (model: SelectedModel) => Promise<void>;
}

/**
 * 管理草稿默认模型与会话级持久化模型。
 * @param activeSessionId - 当前活动会话 ID；空值表示草稿
 * @returns 模型选择状态和操作方法
 */
export function useModelSelection(activeSessionId: Readonly<Ref<string | null>>): UseModelSelectionReturn {
  const serviceModelStore = useServiceModelStore();
  const providerStore = useProviderStore();
  const chatSessionStore = useChatSessionStore();
  /** 当前 BChat 模型来源的一次性初始化任务；失败后允许下次调用重试。 */
  let modelSourcesPromise: Promise<void> | undefined;

  /**
   * 等待全局默认模型和持久化 Provider 同时进入响应式 Store。
   */
  async function loadModelSources(): Promise<void> {
    const request =
      modelSourcesPromise ??
      Promise.all([serviceModelStore.loadChatModel(), providerStore.loadProviders()]).then((): void => {
        // 两个来源均已写入各自 Store，无需保留 Promise 结果。
      });
    modelSourcesPromise = request;
    const [error] = await asyncTo(request);
    if (!error) return;

    if (modelSourcesPromise === request) modelSourcesPromise = undefined;
    throw error;
  }

  /** 当前草稿或会话应使用的模型标识。 */
  const sourceModel = computed<SelectedModel | undefined>((): SelectedModel | undefined => {
    const sessionId = activeSessionId.value;
    if (!sessionId) return serviceModelStore.chatModel;
    return chatSessionStore.findSession(sessionId)?.metadata?.model ?? serviceModelStore.chatModel;
  });

  /** 当前选中的模型配置，从 providerStore 响应式派生 */
  const currentModelConfig = computed<AIProviderModel | undefined>((): AIProviderModel | undefined => {
    const model = sourceModel.value;
    if (!model) return undefined;
    const provider = providerStore.providers.find((item) => item.id === model.providerId);
    if (!provider?.isEnabled) return undefined;
    return provider.models?.find((item) => item.id === model.modelId && item.isEnabled);
  });

  /** 当前选中的模型标识，仅在服务商与模型仍可用时暴露给 UI。 */
  const selectedModel = computed<SelectedModel | undefined>((): SelectedModel | undefined => {
    const model = sourceModel.value;
    return model && currentModelConfig.value ? model : undefined;
  });

  /** 当前模型是否支持视觉识别，从 providerStore 响应式派生 */
  const supportsVision = computed<boolean>((): boolean => currentModelConfig.value?.supportsVision === true);

  /** 当前模型的上下文窗口大小（Token 数） */
  const contextWindow = computed<number>((): number => currentModelConfig.value?.contextWindow ?? 200000);

  /**
   * 初始化当前模型所需的默认模型和 Provider 配置。
   */
  async function loadSelectedModel(): Promise<void> {
    await loadModelSources();
  }

  /**
   * 确保直接打开的会话已进入 Pinia，再解析其持久化模型。
   * @returns 当前可用模型；Provider 或模型不可用时返回 undefined
   */
  async function resolveSelectedModel(): Promise<SelectedModel | undefined> {
    const sessionId = activeSessionId.value;
    const sessionLoad = sessionId ? chatSessionStore.loadSessionById(sessionId) : Promise.resolve(undefined);
    const [error] = await asyncTo(Promise.all([loadModelSources(), sessionLoad]));
    if (error) throw error;
    return selectedModel.value;
  }

  /**
   * 处理模型变更。
   * 草稿切换持久化全局默认模型，已有会话切换持久化会话元数据。
   * @param model - 新选中的模型标识
   */
  async function onModelChange(model: SelectedModel): Promise<void> {
    const sessionId = activeSessionId.value;
    if (!sessionId) {
      await serviceModelStore.setChatModel(model);
      return;
    }

    await chatSessionStore.updateSessionModel(sessionId, model);
  }

  return {
    selectedModel,
    supportsVision,
    contextWindow,
    loadSelectedModel,
    resolveSelectedModel,
    onModelChange
  };
}
