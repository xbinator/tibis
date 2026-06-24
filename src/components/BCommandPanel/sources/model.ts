/**
 * @file model.ts
 * @description BCommandPanel 模型选择 source，负责 provider 分组、搜索和 active 状态。
 */
import type { CommandPanelActionItem, CommandPanelGroup, CommandPanelIconContext, CommandPanelSource } from '../types';
import type { VNodeChild } from 'vue';
import type { ModelGroup } from '@/stores/ai/provider';
import type { SelectedModel } from '@/stores/ai/serviceModel';

/**
 * 模型 source 依赖。
 */
export interface ModelSourceDeps {
  /** 加载 provider 列表。 */
  loadProviders: () => Promise<void>;
  /** 加载当前聊天模型。 */
  loadChatModel: () => Promise<void>;
  /** 设置当前聊天模型。 */
  setChatModel: (model: SelectedModel) => Promise<void>;
  /** 获取可用模型分组。 */
  getAvailableModels: () => ModelGroup[];
  /** 获取当前聊天模型。 */
  getCurrentModel: () => SelectedModel | undefined;
  /** 渲染模型图标。 */
  renderModelIcon: (model: SelectedModel, context: CommandPanelIconContext) => VNodeChild;
}

/** 模型值解析正则表达式。 */
const MODEL_VALUE_RE = /^([^:]+):(.+)$/;

/**
 * 解析模型值。
 * @param value - 模型值（providerId:modelId）
 * @returns 解析后的模型标识，格式错误时返回 null
 */
function parseModelValue(value: string): SelectedModel | null {
  const [, providerId, modelId] = value.match(MODEL_VALUE_RE) ?? [];
  return providerId && modelId ? { providerId, modelId } : null;
}

/**
 * 判断模型是否匹配关键词。
 * @param group - provider 分组
 * @param model - 模型项
 * @param query - 小写关键词
 * @returns 是否匹配
 */
function isModelMatched(group: ModelGroup, model: ModelGroup['models'][number], query: string): boolean {
  return group.providerName.toLowerCase().includes(query) || model.modelName.toLowerCase().includes(query) || model.modelId.toLowerCase().includes(query);
}

/**
 * 创建模型选择 source。
 * @param deps - source 依赖
 * @returns 模型选择 source
 */
export function createModelSource(deps: ModelSourceDeps): CommandPanelSource {
  return {
    id: 'model',
    load: async (): Promise<void> => {
      await deps.loadProviders();
      await deps.loadChatModel();
    },
    search: (keyword: string): CommandPanelGroup[] => {
      const query = keyword.trim().toLowerCase();
      const currentModel = deps.getCurrentModel();

      return deps
        .getAvailableModels()
        .map((group): CommandPanelGroup => {
          const models = group.models.filter((model) => !query || isModelMatched(group, model, query));
          const items: CommandPanelActionItem[] = models
            .map((model): CommandPanelActionItem | null => {
              const parsed = parseModelValue(model.value);
              if (!parsed) return null;

              return {
                key: model.value,
                kind: 'model',
                title: model.modelName,
                description: model.modelId,
                active: currentModel?.providerId === parsed.providerId && currentModel.modelId === parsed.modelId,
                onSelect: async (): Promise<void> => deps.setChatModel(parsed),
                renderIcon: (context) => deps.renderModelIcon(parsed, context)
              };
            })
            .filter((item): item is CommandPanelActionItem => item !== null);

          return {
            key: group.providerId,
            title: group.providerName,
            items
          };
        })
        .filter((group) => group.items.length > 0);
    }
  };
}
