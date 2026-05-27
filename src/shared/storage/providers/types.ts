import type { AIProviderModel, AIProviderType } from 'types/ai';

/**
 * 存储的文件信息
 */
export interface StoredFile {
  /** 文件唯一标识符 */
  id: string;
  /** 文件路径，可为空 */
  path: string | null;
  /** 文件内容 */
  content: string;
  /** 最近一次与磁盘同步的内容 */
  savedContent?: string;
  /** 文件名称 */
  name: string;
  /** 文件扩展名 */
  ext: string;
}

/**
 * 存储的提供商设置（用于持久化）
 */
export interface StoredProviderSettings {
  /** 是否启用 */
  isEnabled?: boolean;
  /** API 密钥 */
  apiKey?: string;
  /** 自定义 API 基础地址 */
  baseUrl?: string;
  /** 模型配置列表 */
  models?: AIProviderModel[];
}

/**
 * 设置状态
 */
export interface SettingsState {
  /** 提供商设置映射表，键为提供商 ID */
  providers: Record<string, StoredProviderSettings>;
}

/**
 * settings.json 中的单个 provider 条目
 * 内置服务商仅存用户覆盖的字段，自定义服务商全量存储
 */
export interface StoredProviderEntry {
  /** 服务商 ID（唯一标识，规范化为小写） */
  id: string;
  /** 是否启用 */
  isEnabled?: boolean;
  /** API 密钥 */
  apiKey?: string;
  /** 自定义 API 基础地址 */
  baseUrl?: string;
  /** 模型配置列表 */
  models?: AIProviderModel[];
  /** 服务商名称（自定义服务商必填） */
  name?: string;
  /** 服务商描述 */
  description?: string;
  /** 请求格式类型（自定义服务商必填） */
  type?: AIProviderType;
  /** 服务商 Logo URL */
  logo?: string;
  /** 是否为自定义服务商 */
  isCustom?: boolean;
}

/**
 * settings.json 文件内容
 */
export interface SettingsFileContent {
  /** Schema 版本号 */
  version: number;
  /** 服务商配置列表（数组顺序即展示顺序） */
  providers: StoredProviderEntry[];
}
