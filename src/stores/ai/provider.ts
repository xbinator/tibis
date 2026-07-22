/**
 * @file provider.ts
 * @description AI Provider 配置状态、持久化加载与可用模型派生。
 */
import type { AIProvider, AIProviderModel, AICustomProvider } from 'types/ai';
import { defineStore } from 'pinia';
import { cloneDeep } from 'lodash-es';
import { DEFAULT_PROVIDERS, providerStorage } from '@/shared/storage';
import { asyncTo } from '@/utils/asyncTo';

/** 当前 Provider 持久化读取任务，用于合并并发加载。 */
let providerLoadPromise: Promise<AIProvider[]> | undefined;

/**
 * 读取持久化 Provider，并让并发调用共享同一个在途请求。
 * @returns Provider 列表
 */
async function loadStoredProviders(): Promise<AIProvider[]> {
  const request = providerLoadPromise ?? providerStorage.listProviders();
  providerLoadPromise = request;
  const [error, providers] = await asyncTo(request);
  if (providerLoadPromise === request) providerLoadPromise = undefined;
  if (error) throw error;
  return providers;
}

/** Provider 状态 */
interface ProviderState {
  /** 服务商列表 */
  providers: AIProvider[];
  /** 是否正在加载 */
  loading: boolean;
}

/** 渲染到选择器中的单个模型项。 */
export interface ModelItem {
  /** 组合后的选择器值（providerId:modelId）。 */
  value: string;
  /** 模型 ID。 */
  modelId: string;
  /** 模型显示名称。 */
  modelName: string;
}

/** 按提供方分组后的可用模型集合。 */
export interface ModelGroup {
  /** 提供方 ID。 */
  providerId: string;
  /** 提供方显示名称。 */
  providerName: string;
  /** 当前提供方下可用模型列表。 */
  models: ModelItem[];
}

/** Provider Store */
export const useProviderStore = defineStore('provider', {
  state: (): ProviderState => ({
    providers: DEFAULT_PROVIDERS.map((p) => cloneDeep(p)),
    loading: false
  }),

  getters: {
    /** 可用于下拉选择的服务商列表 */
    providerList: (state) => state.providers.map((p) => ({ label: p.name, value: p.id })),

    /** 启用的服务商列表 */
    enabledProviders: (state) => state.providers.filter((p) => p.isEnabled),

    /**
     * 按提供方分组的可用模型列表。
     * 过滤口径：仅保留已启用 provider 下的已启用 model，作为模型选择器的事实源。
     */
    availableModels: (state): ModelGroup[] => {
      const result: ModelGroup[] = [];
      for (const provider of state.providers) {
        if (!provider.isEnabled || !provider.models?.length) continue;

        const models = provider.models.filter((m) => m.isEnabled).map((m) => ({ value: `${provider.id}:${m.id}`, modelId: m.id, modelName: m.name }));
        if (!models.length) continue;

        result.push({ providerId: provider.id, providerName: provider.name, models });
      }
      return result;
    }
  },

  actions: {
    /**
     * 加载服务商列表
     */
    async loadProviders(): Promise<void> {
      this.loading = true;
      try {
        this.providers = await loadStoredProviders();
      } finally {
        this.loading = false;
      }
    },

    /**
     * 获取服务商信息
     * @param id 服务商 ID
     */
    async getProviderById(id: string): Promise<AIProvider | null> {
      if (!this.providers.length) {
        await this.loadProviders();
      }
      return this.providers.find((p) => p.id === id) || null;
    },

    /**
     * 更新服务商信息
     * @param id 服务商 ID
     * @param patch 要更新的服务商信息
     */
    async updateProvider(id: string, patch: Partial<AIProvider>): Promise<AIProvider | null> {
      const nextProvider = await providerStorage.updateProvider(id, {
        isEnabled: patch.isEnabled,
        apiKey: patch.apiKey,
        baseUrl: patch.baseUrl,
        models: patch.models
      });
      await this.loadProviders();
      return nextProvider;
    },

    /**
     * 切换服务商的启用状态
     * @param id 服务商 ID
     * @param enabled 是否启用
     */
    async toggleProvider(id: string, enabled: boolean): Promise<AIProvider | null> {
      const nextProvider = await providerStorage.toggleProvider(id, enabled);
      await this.loadProviders();
      return nextProvider;
    },

    /**
     * 保存服务商的配置信息
     * @param id 服务商 ID
     * @param config 配置信息，包含 apiKey 和 baseUrl
     */
    async saveProviderConfig(id: string, config: Pick<AIProvider, 'apiKey' | 'baseUrl'>): Promise<AIProvider | null> {
      const nextProvider = await providerStorage.saveProviderConfig(id, config);
      await this.loadProviders();
      return nextProvider;
    },

    /**
     * 保存服务商的模型列表
     * @param id 服务商 ID
     * @param models 模型列表
     */
    async saveProviderModels(id: string, models: AIProviderModel[]): Promise<AIProvider | null> {
      const nextProvider = await providerStorage.saveProviderModels(id, models);
      await this.loadProviders();
      return nextProvider;
    },

    /**
     * 创建或更新自定义服务商
     * @param payload 自定义服务商信息
     */
    async saveCustomProvider(payload: AICustomProvider): Promise<AIProvider | null> {
      const nextProvider = await providerStorage.createOrUpdateCustomProvider(payload);
      await this.loadProviders();
      return nextProvider;
    },

    /**
     * 删除自定义服务商
     * @param id 服务商 ID
     */
    async deleteCustomProvider(id: string): Promise<boolean> {
      const result = await providerStorage.deleteCustomProvider(id);
      if (result) {
        await this.loadProviders();
      }
      return result;
    },

    /**
     * 重新排序服务商列表
     * @param orderedIds 排序后的服务商 ID 数组
     */
    async reorderProviders(orderedIds: string[]): Promise<AIProvider[]> {
      await providerStorage.reorderProviders(orderedIds);
      await this.loadProviders();
      return this.providers;
    }
  }
});
