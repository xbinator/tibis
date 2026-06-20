/**
 * @file index.ts
 * @description 统一管理 ~/.tibis/settings.json 的读取、备份恢复与串行写入。
 */
import type { AIProvider, AIProviderModel } from 'types/ai';
import { native } from '@/shared/platform/native';
import { DEFAULT_PROVIDERS } from '@/shared/storage/providers/defaults';
import type { SettingsFileContent, StoredProviderEntry } from '@/shared/storage/providers/types';
import { DEFAULT_MCP_TOOL_SETTINGS, DEFAULT_TOOL_SETTINGS } from '@/shared/storage/tool-settings/types';
import { asyncTo } from '@/utils/asyncTo';

const SETTINGS_FILE = 'settings.json';

/**
 * 判断模型是否为删除标记。
 * @param model - 模型配置
 * @returns 模型是否已被用户删除
 */
function isDeletedModel(model: AIProviderModel): boolean {
  return model.isDelete === true;
}

/**
 * 克隆模型并清理删除标记。
 * @param model - 模型配置
 * @returns 可见模型配置
 */
function restoreModel(model: AIProviderModel): AIProviderModel {
  const nextModel = { ...model };
  delete nextModel.isDelete;
  return nextModel;
}

/**
 * 克隆模型并标记为删除。
 * @param model - 模型配置
 * @returns 删除标记模型
 */
function markModelDeleted(model: AIProviderModel): AIProviderModel {
  return { ...model, isDelete: true };
}

/**
 * 计算内置服务商的完整持久化模型列表。
 * @param base - 内置服务商默认配置
 * @param existing - settings.json 中已保存的服务商条目
 * @returns 包含删除标记的完整模型列表
 */
function buildCompleteStoredModels(base: AIProvider, existing?: StoredProviderEntry): AIProviderModel[] {
  const storedModels = existing?.models;
  if (!storedModels) {
    return (base.models ?? []).map((model) => ({ ...model }));
  }

  const storedModelIds = new Set(storedModels.map((model) => model.id));
  const defaultModelIds = new Set((base.models ?? []).map((model) => model.id));
  const visibleStoredModels = storedModels.filter((model) => !isDeletedModel(model)).map((model) => restoreModel(model));
  const newDefaultModels = (base.models ?? []).filter((model) => !storedModelIds.has(model.id)).map((model) => ({ ...model }));
  const deletedDefaultModels = (base.models ?? []).filter((model) => {
    return storedModelIds.has(model.id) && storedModels.some((storedModel) => storedModel.id === model.id && isDeletedModel(storedModel));
  });
  const preservedDeletedModels = storedModels.filter((model) => isDeletedModel(model) && !defaultModelIds.has(model.id)).map((model) => ({ ...model }));

  return [...visibleStoredModels, ...newDefaultModels, ...deletedDefaultModels.map((model) => markModelDeleted(model)), ...preservedDeletedModels];
}

/**
 * 将内置服务商条目补齐为可独立读取的完整快照。
 * @param base - 内置服务商默认配置
 * @param existing - settings.json 中已保存的服务商条目
 * @returns 完整服务商条目
 */
function completeBuiltInProviderEntry(base: AIProvider, existing?: StoredProviderEntry): StoredProviderEntry {
  return {
    id: base.id,
    name: base.name,
    description: base.description,
    type: base.type,
    logo: base.logo,
    isEnabled: existing?.isEnabled ?? base.isEnabled,
    apiKey: existing?.apiKey,
    baseUrl: existing?.baseUrl ?? base.baseUrl,
    models: buildCompleteStoredModels(base, existing),
    readonly: base.readonly,
    isCustom: false
  };
}

/**
 * 规范化 provider 列表，内置服务商补齐完整快照，自定义服务商保留在末尾。
 * @param entries - 原始 provider 条目列表
 * @returns 可直接持久化的 provider 条目列表
 */
function normalizeProviderEntries(entries: StoredProviderEntry[]): StoredProviderEntry[] {
  const normalizedEntries = entries
    .filter((entry) => typeof entry.id === 'string' && entry.id.trim().length > 0)
    .map((entry) => ({ ...entry, id: entry.id.trim().toLowerCase() }));
  const entryMap = new Map(normalizedEntries.map((entry) => [entry.id, entry]));
  const result = DEFAULT_PROVIDERS.map((provider) => completeBuiltInProviderEntry(provider, entryMap.get(provider.id)));
  const seenIds = new Set(result.map((entry) => entry.id));

  for (const entry of normalizedEntries) {
    if (!seenIds.has(entry.id)) {
      result.push(entry.isCustom === true ? { ...entry, readonly: false, isCustom: true } : entry);
      seenIds.add(entry.id);
    }
  }

  return result;
}

/**
 * 默认 settings.json 内容。
 * @returns 默认设置文件结构
 */
function createDefaultSettingsFile(): SettingsFileContent {
  return { version: 1, providers: normalizeProviderEntries([]), mcp: DEFAULT_MCP_TOOL_SETTINGS, tavily: DEFAULT_TOOL_SETTINGS.tavily };
}

/**
 * 归一化 settings.json 的基础结构。
 * 这里仅处理顶层形状，各业务字段的深度归一化由调用方负责。
 * @param value - 原始 settings.json 内容
 * @returns 合法 settings.json 内容
 */
function normalizeSettingsFile(value: unknown): SettingsFileContent {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<SettingsFileContent>) : {};

  return {
    version: 1,
    providers: normalizeProviderEntries(Array.isArray(source.providers) ? (source.providers as StoredProviderEntry[]) : []),
    mcp: source.mcp ?? DEFAULT_MCP_TOOL_SETTINGS,
    tavily: source.tavily ?? DEFAULT_TOOL_SETTINGS.tavily
  };
}

/**
 * 获取 settings.json 的完整路径。
 * @returns settings.json 路径，不可用时返回 null
 */
async function getSettingsPath(): Promise<string | null> {
  try {
    const root = await native.getTibisWorkspaceRoot();
    if (!root) return null;
    return `${root.rootPath}/${SETTINGS_FILE}`;
  } catch {
    return null;
  }
}

/**
 * 从备份文件恢复 settings.json。
 * @param filePath - settings.json 路径
 * @returns 恢复后的配置，恢复失败时返回 null
 */
async function recoverFromBackup(filePath: string): Promise<SettingsFileContent | null> {
  const bakPath = `${filePath}.bak`;
  const bakStatus = await native.getPathStatus(bakPath);
  if (!bakStatus.exists) return null;

  try {
    const { content } = await native.readFile(bakPath);
    const normalized = normalizeSettingsFile(JSON.parse(content));
    await native.writeFile(filePath, JSON.stringify(normalized, null, 2));
    return normalized;
  } catch {
    return null;
  }
}

/**
 * 读取 settings.json。
 * @returns 归一化后的配置，路径不可用或文件不存在时返回默认结构
 */
async function readSettingsFile(): Promise<SettingsFileContent> {
  const filePath = await getSettingsPath();
  if (!filePath) return createDefaultSettingsFile();

  const status = await native.getPathStatus(filePath);
  if (!status.exists) {
    return (await recoverFromBackup(filePath)) ?? createDefaultSettingsFile();
  }

  const { content } = await native.readFile(filePath);
  try {
    return normalizeSettingsFile(JSON.parse(content));
  } catch {
    return (await recoverFromBackup(filePath)) ?? createDefaultSettingsFile();
  }
}

/**
 * 写入 settings.json，并备份当前文件。
 * @param data - 待写入配置
 */
async function writeSettingsFile(data: SettingsFileContent): Promise<void> {
  const filePath = await getSettingsPath();
  if (!filePath) return;

  const status = await native.getPathStatus(filePath);
  if (status.exists) {
    const { content: currentContent } = await native.readFile(filePath);
    await native.writeFile(`${filePath}.bak`, currentContent);
  }

  await native.writeFile(filePath, JSON.stringify(normalizeSettingsFile(data), null, 2));
}

/** settings.json 写入队列，避免并发覆盖。 */
let settingsWriteQueue: Promise<void> = Promise.resolve();

/**
 * 统一 settings.json 存储层。
 */
export const settingsFileStorage = {
  /**
   * 读取 settings.json。
   * @returns settings.json 内容
   */
  async read(): Promise<SettingsFileContent> {
    const [error, settings] = await asyncTo(readSettingsFile());
    if (error) return createDefaultSettingsFile();
    return settings;
  },

  /**
   * 串行化更新 settings.json。
   * @param transformer - 配置转换函数
   * @returns 写入后的配置
   */
  async update(transformer: (current: SettingsFileContent) => SettingsFileContent): Promise<SettingsFileContent> {
    const previousWriteQueue = settingsWriteQueue;
    const updatePromise = (async (): Promise<SettingsFileContent> => {
      await asyncTo(previousWriteQueue);
      const current = await readSettingsFile();
      const next = normalizeSettingsFile(transformer(current));
      await writeSettingsFile(next);
      return next;
    })();
    settingsWriteQueue = asyncTo(updatePromise).then((): undefined => undefined);

    const [error, result] = await asyncTo(updatePromise);
    if (!error) return result;

    const [readError, current] = await asyncTo(readSettingsFile());
    if (readError) return createDefaultSettingsFile();
    return normalizeSettingsFile(transformer(current));
  }
};

export { normalizeSettingsFile, createDefaultSettingsFile };
