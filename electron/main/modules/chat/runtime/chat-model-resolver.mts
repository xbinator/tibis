/**
 * @file chat-model-resolver.mts
 * @description ChatRuntime chat 模型配置解析器。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AICreateOptions, AIProvider, AIProviderType } from 'types/ai';
import { dbSelect } from '../../database/service.mjs';
import { ensureTibisWorkspaceRoot } from '../../workspace/root.mjs';

/** settings.json 中的 provider 条目形状。 */
export interface StoredChatProviderEntry {
  /** Provider id。 */
  id: string;
  /** 是否启用。 */
  isEnabled?: boolean;
  /** API key。 */
  apiKey?: string;
  /** Base URL。 */
  baseUrl?: string;
  /** Provider 名称。 */
  name?: string;
  /** Provider 描述。 */
  description?: string;
  /** 请求格式类型。 */
  type?: AIProviderType;
  /** 是否自定义 provider。 */
  isCustom?: boolean;
  /** 模型列表。 */
  models?: AIProvider['models'];
}

/** 主进程内置 provider 轻量元数据。 */
const BUILTIN_PROVIDER_METADATA: Record<string, Pick<AIProvider, 'id' | 'name' | 'description' | 'type' | 'baseUrl'>> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic provider',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek provider',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1'
  },
  google: {
    id: 'google',
    name: 'Google AI',
    description: 'Google AI provider',
    type: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI provider',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1'
  },
  siliconflow: {
    id: 'siliconflow',
    name: 'SiliconFlow',
    description: 'SiliconFlow provider',
    type: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1'
  }
};

/** service_models 行结构。 */
interface ChatServiceModelRow {
  /** Provider id。 */
  provider_id: string | null;
  /** Model id。 */
  model_id: string | null;
}

/** settings.json 形状。 */
interface ChatSettingsFile {
  /** Provider 条目。 */
  providers?: StoredChatProviderEntry[];
}

/** 查询聊天模型配置 SQL。 */
const SELECT_CHAT_MODEL_SQL = "SELECT provider_id, model_id FROM service_models WHERE service_type = 'chat' LIMIT 1";

/** settings 文件名。 */
const SETTINGS_FILE_NAME = 'settings.json';

/** 聊天服务模型配置。 */
export interface ChatModelConfig {
  /** Provider id。 */
  providerId?: string;
  /** Model id。 */
  modelId?: string;
}

/** chat 模型解析结果。 */
export interface ChatModelResolution {
  /** AI 服务创建参数。 */
  createOptions: AICreateOptions;
  /** 模型 ID。 */
  modelId: string;
}

/** chat 模型解析依赖。 */
export interface ChatModelResolverDependencies {
  /**
   * 读取当前聊天模型配置。
   * @returns 聊天模型配置
   */
  getChatModelConfig: () => Promise<ChatModelConfig | null>;
  /**
   * 读取 provider 配置。
   * @param providerId - provider id
   * @returns provider 配置
   */
  getProvider: (providerId: string) => Promise<AIProvider | null>;
}

/**
 * 读取主进程聊天模型配置。
 * @returns 聊天模型配置
 */
async function getDefaultChatModelConfig(): Promise<ChatModelConfig | null> {
  const rows = dbSelect<ChatServiceModelRow>(SELECT_CHAT_MODEL_SQL);
  const row = rows[0];
  if (!row) return null;

  return {
    providerId: row.provider_id ?? undefined,
    modelId: row.model_id ?? undefined
  };
}

/**
 * 读取 settings.json。
 * @returns settings 文件内容
 */
async function readChatSettingsFile(): Promise<ChatSettingsFile> {
  try {
    const root = await ensureTibisWorkspaceRoot();
    const content = await fs.readFile(path.join(root.rootPath, SETTINGS_FILE_NAME), 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const source = parsed as ChatSettingsFile;
    return {
      providers: Array.isArray(source.providers) ? source.providers : []
    };
  } catch {
    return {};
  }
}

/** chat 模型解析器。 */
export interface ChatModelResolver {
  /**
   * 解析当前 chat 模型调用配置。
   * @returns chat 模型配置，不可用时返回 null
   */
  resolve(): Promise<ChatModelResolution | null>;
}

/**
 * 判断 provider 模型是否可用。
 * @param provider - provider 配置
 * @param modelId - 模型 ID
 * @returns 模型是否可用
 */
function hasEnabledModel(provider: AIProvider, modelId: string): boolean {
  if (!provider.models) return true;

  return Boolean(provider.models?.some((model) => model.id === modelId && model.isEnabled && !model.isDelete));
}

/**
 * 将 settings.json provider 条目合并为 AIProvider。
 * @param entry - settings provider 条目
 * @returns AIProvider，不可识别时返回 null
 */
export function mergeProviderSettings(entry: StoredChatProviderEntry): AIProvider | null {
  const id = entry.id.trim().toLowerCase();
  const base = BUILTIN_PROVIDER_METADATA[id];
  const isCustom = entry.isCustom === true;

  if (!base && (!isCustom || !entry.name || !entry.type)) {
    return null;
  }

  return {
    id,
    name: entry.name ?? base?.name ?? id,
    description: entry.description ?? base?.description ?? 'Custom provider',
    type: entry.type ?? base?.type ?? 'openai',
    baseUrl: entry.baseUrl ?? base?.baseUrl,
    apiKey: entry.apiKey,
    isEnabled: entry.isEnabled ?? false,
    isCustom,
    models: entry.models
  };
}

/**
 * 读取主进程 provider 配置。
 * @param providerId - provider id
 * @returns provider 配置
 */
async function getDefaultProvider(providerId: string): Promise<AIProvider | null> {
  const settings = await readChatSettingsFile();
  const normalizedId = providerId.trim().toLowerCase();
  const entry = settings.providers?.find((provider) => provider.id.trim().toLowerCase() === normalizedId);

  return mergeProviderSettings(entry ?? { id: normalizedId });
}

/**
 * 创建 chat 模型解析器。
 * @param dependencies - 解析依赖
 * @returns chat 模型解析器
 */
export function createChatModelResolver(dependencies: ChatModelResolverDependencies): ChatModelResolver {
  return {
    async resolve(): Promise<ChatModelResolution | null> {
      const config = await dependencies.getChatModelConfig();
      if (!config?.providerId || !config.modelId) return null;

      const provider = await dependencies.getProvider(config.providerId);
      if (!provider?.isEnabled || !hasEnabledModel(provider, config.modelId)) return null;

      return {
        createOptions: {
          providerId: provider.id,
          providerName: provider.name,
          apiKey: provider.apiKey ?? '',
          baseUrl: provider.baseUrl ?? '',
          providerType: provider.type
        },
        modelId: config.modelId
      };
    }
  };
}

/**
 * 创建默认 chat 模型解析器。
 * @returns chat 模型解析器
 */
export function createDefaultChatModelResolver(): ChatModelResolver {
  return createChatModelResolver({
    getChatModelConfig: getDefaultChatModelConfig,
    getProvider: getDefaultProvider
  });
}
