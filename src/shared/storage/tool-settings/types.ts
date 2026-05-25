/**
 * @file types.ts
 * @description Tavily 工具设置类型、默认值与归一化工具。
 */

/**
 * Tavily Search 深度。
 */
export type TavilySearchDepth = 'basic' | 'advanced';

/**
 * Tavily Search 主题。
 */
export type TavilySearchTopic = 'general' | 'news' | 'finance';

/**
 * Tavily Search 时间范围。
 */
export type TavilyTimeRange = 'day' | 'week' | 'month' | 'year' | null;

/**
 * Tavily Extract 深度。
 */
export type TavilyExtractDepth = 'basic' | 'advanced';

/**
 * Tavily Extract 输出格式。
 */
export type TavilyExtractFormat = 'markdown' | 'text';

/**
 * Tavily Search 默认参数。
 */
export interface TavilySearchDefaults {
  /** 搜索深度 */
  searchDepth: TavilySearchDepth;
  /** 搜索主题 */
  topic: TavilySearchTopic;
  /** 时间范围 */
  timeRange: TavilyTimeRange;
  /** 国家名称 */
  country: string | null;
  /** 最大结果数 */
  maxResults: number;
  /** 是否包含 AI 摘要 */
  includeAnswer: boolean;
  /** 是否包含图片 */
  includeImages: boolean;
  /** 限定域名 */
  includeDomains: string[];
  /** 排除域名 */
  excludeDomains: string[];
}

/**
 * Tavily Extract 默认参数。
 */
export interface TavilyExtractDefaults {
  /** 提取深度 */
  extractDepth: TavilyExtractDepth;
  /** 输出格式 */
  format: TavilyExtractFormat;
  /** 是否包含图片 */
  includeImages: boolean;
}

/**
 * Tavily 工具设置。
 */
export interface TavilyToolSettings {
  /** 是否启用 Tavily 工具 */
  enabled: boolean;
  /** Tavily API Key */
  apiKey: string;
  /** Search 默认参数 */
  searchDefaults: TavilySearchDefaults;
  /** Extract 默认参数 */
  extractDefaults: TavilyExtractDefaults;
}

// ─── MCP Transport ────────────────────────────────────────────────────────────

/**
 * MCP transport 类型。
 */
export type MCPTransportType = 'stdio' | 'streamableHTTP' | 'sse';

/**
 * MCP OAuth 配置。
 */
export interface MCPOAuthConfig {
  /** OAuth 客户端 ID */
  clientId?: string;
  /** OAuth 客户端密钥 */
  clientSecret?: string;
  /** 访问令牌 */
  accessToken?: string;
  /** 刷新令牌 */
  refreshToken?: string;
  /** 令牌过期时间（Unix 时间戳，秒） */
  expiresAt?: number;
  /** 授权范围 */
  scope?: string;
}

/**
 * MCP server 配置。
 */
export interface MCPServerConfig {
  /** 稳定 ID */
  id: string;
  /** 展示名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** transport 类型 */
  transport: MCPTransportType;
  /** HTTP/SSE 端点 URL（streamableHTTP / sse 必填） */
  url?: string;
  /** 启动命令（stdio 必填） */
  command: string;
  /** 启动参数 */
  args: string[];
  /** 环境变量 */
  env: Record<string, string>;
  /** 默认允许暴露的 tool 名称 */
  toolAllowlist: string[];
  /** OAuth 配置（远程服务器可选） */
  oauth?: MCPOAuthConfig;
  /** 是否监听工具变更通知 */
  watchToolChanges?: boolean;
  /** 连接与握手超时 */
  connectTimeoutMs: number;
  /** 单次工具调用超时 */
  toolCallTimeoutMs: number;
}

// ─── MCP Tool Selector ──────────────────────────────────────────────────────

/**
 * MCP tool 的结构化选择器。
 */
export interface MCPToolSelector {
  /** 所属 server ID */
  serverId: string;
  /** 原始 tool 名称 */
  toolName: string;
}

// ─── MCP Tool Settings ──────────────────────────────────────────────────────

/**
 * MCP 设置总结构。
 */
export interface MCPToolSettings {
  /** server 列表 */
  servers: MCPServerConfig[];
}

// ─── MCP Request Config ─────────────────────────────────────────────────────

/**
 * 发往主进程 AI 服务的 MCP 请求配置。
 */
export interface AIMCPRequestConfig {
  /** 当前请求携带的 MCP server 配置快照 */
  servers: MCPServerConfig[];
  /** 当前请求启用的 server ID */
  enabledServerIds: string[];
  /** 当前请求允许的 tool 标识 */
  enabledTools: MCPToolSelector[];
  /** 当前请求附加的 MCP 工具说明词 */
  toolInstructions: string;
}

// ─── MCP Discovery Snapshot ─────────────────────────────────────────────────

/**
 * Discovery cache 中的工具快照。
 */
export interface MCPDiscoveredToolSnapshot {
  /** 所属 server ID */
  serverId: string;
  /** 原始 tool 名称 */
  toolName: string;
  /** 工具描述 */
  description?: string;
  /** MCP tool inputSchema */
  inputSchema?: Record<string, unknown>;
}

/**
 * 单个 server 的 discovery cache。
 */
export interface MCPServerDiscoveryCache {
  serverId: string;
  tools: MCPDiscoveredToolSnapshot[];
  discoveredAt: number;
}

// ─── MCP Defaults ────────────────────────────────────────────────────────────

export const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 20000;
export const DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS = 30000;
export const MIN_CONNECT_TIMEOUT_MS = 1000;
export const MAX_CONNECT_TIMEOUT_MS = 120000;
export const MIN_TOOL_CALL_TIMEOUT_MS = 1000;
export const MAX_TOOL_CALL_TIMEOUT_MS = 120000;

export const DEFAULT_MCP_TOOL_SETTINGS: MCPToolSettings = {
  servers: []
};

// ─── ToolSettingsState ───────────────────────────────────────────────────────

/**
 * 工具设置总结构。
 */
export interface ToolSettingsState {
  /** Tavily 配置 */
  tavily: TavilyToolSettings;
  /** MCP 配置 */
  mcp: MCPToolSettings;
}

/**
 * 工具设置持久化键。
 */
export const TOOL_SETTINGS_STORAGE_KEY = 'tool_settings';

/**
 * 默认配置。
 */
export const DEFAULT_TOOL_SETTINGS: ToolSettingsState = {
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
  mcp: DEFAULT_MCP_TOOL_SETTINGS
};
