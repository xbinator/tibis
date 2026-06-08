/**
 * @file index.ts
 * @description 统一管理 ~/.tibis/settings.json 的读取、备份恢复与串行写入。
 */
import { native } from '@/shared/platform/native';
import type { SettingsFileContent, StoredProviderEntry } from '@/shared/storage/providers/types';
import { DEFAULT_MCP_TOOL_SETTINGS, DEFAULT_TOOL_SETTINGS } from '@/shared/storage/tool-settings/types';
import { asyncTo } from '@/utils/asyncTo';

const SETTINGS_FILE = 'settings.json';

/**
 * 默认 settings.json 内容。
 * @returns 默认设置文件结构
 */
function createDefaultSettingsFile(): SettingsFileContent {
  return { version: 1, providers: [], mcp: DEFAULT_MCP_TOOL_SETTINGS, tavily: DEFAULT_TOOL_SETTINGS.tavily };
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
    providers: Array.isArray(source.providers) ? (source.providers as StoredProviderEntry[]) : [],
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
