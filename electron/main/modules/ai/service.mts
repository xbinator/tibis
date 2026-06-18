/**
 * @file service.mts
 * @description AI 服务核心类，封装文本生成和流式文本生成能力
 */
import type { FlexibleSchema, ToolExecutionOptions, ToolSet } from 'ai';
import type { AICreateOptions, AIRequestOptions, AIInvokeResult, AIStreamResult, AIServiceError, MCPDiscoveredToolSnapshot } from 'types/ai';
import { generateText, jsonSchema, Output, stepCountIs, streamText, tool } from 'ai';
import { log } from '../logger/service.mjs';
import { connectMcpServer, executeMcpTool, getMcpDiscoveryCache } from '../mcp/session.mjs';
import { createMcpSdkTools, resolveMcpExposedTools } from '../mcp/tools.mjs';
import { AI_ERROR_CODE } from './errors/codes.mjs';
import { AIProviderRegistry } from './providers/_index.mjs';

// ─── 纯工具函数 ──────────────────────────────────────────────────────────────

/** Tavily API 基础地址。 */
const TAVILY_API_BASE_URL = 'https://api.tavily.com';

/** Tavily API 端点。 */
type TavilyEndpoint = '/search' | '/extract';

/** Tavily 搜索深度。 */
type TavilySearchDepth = 'basic' | 'advanced';

/** Tavily 搜索主题。 */
type TavilySearchTopic = 'general' | 'news' | 'finance';

/** Tavily 搜索时间范围。 */
type TavilyTimeRange = 'day' | 'month' | 'year' | 'd' | 'y' | 'm' | 'week' | 'w';

/** Tavily 提取深度。 */
type TavilyExtractDepth = 'basic' | 'advanced';

/** Tavily 提取输出格式。 */
type TavilyExtractFormat = 'markdown' | 'text';

/**
 * Tavily Search 硬编码默认参数。
 */
const TAVILY_SEARCH_DEFAULTS = {
  searchDepth: 'basic' as TavilySearchDepth,
  topic: 'general' as TavilySearchTopic,
  timeRange: undefined as TavilyTimeRange | undefined,
  country: 'china' as string | undefined,
  maxResults: 5,
  includeAnswer: true,
  includeImages: false,
  includeDomains: [] as string[],
  excludeDomains: [] as string[]
};

/**
 * Tavily Extract 硬编码默认参数。
 */
const TAVILY_EXTRACT_DEFAULTS = {
  extractDepth: 'basic' as TavilyExtractDepth,
  format: 'markdown' as TavilyExtractFormat,
  includeImages: false
};

/**
 * Tavily Search 工具输入。
 */
interface TavilySearchInput {
  /** 搜索查询。 */
  query: string;
  /** 搜索深度。 */
  searchDepth?: TavilySearchDepth;
  /** 搜索主题。 */
  topic?: TavilySearchTopic;
  /** 搜索时间范围。 */
  timeRange?: TavilyTimeRange;
  /** 本地化搜索国家。 */
  country?: string;
  /** 最大结果数。 */
  maxResults?: number;
  /** 是否包含 Tavily 生成的答案。 */
  includeAnswer?: boolean;
  /** 是否包含图片。 */
  includeImages?: boolean;
  /** 限定搜索域名。 */
  includeDomains?: string[];
  /** 排除搜索域名。 */
  excludeDomains?: string[];
}

/**
 * Tavily Extract 单 URL 输入。
 */
interface TavilyExtractSingleUrlInput {
  /** 需要提取正文的页面 URL。 */
  url: string;
  /** 提取深度。 */
  extractDepth?: 'basic' | 'advanced';
  /** 可选的重排意图查询。 */
  query?: string;
}

/**
 * Tavily Search API 请求体。
 */
interface TavilySearchRequest {
  /** 搜索查询。 */
  query: string;
  /** Tavily API snake_case 搜索深度。 */
  search_depth: TavilySearchDepth;
  /** 搜索主题。 */
  topic: TavilySearchTopic;
  /** 搜索时间范围。 */
  time_range?: TavilyTimeRange;
  /** 本地化搜索国家。 */
  country?: string;
  /** 最大结果数。 */
  max_results: number;
  /** 是否包含 Tavily 生成的答案。 */
  include_answer: boolean;
  /** 是否包含图片。 */
  include_images: boolean;
  /** 限定搜索域名。 */
  include_domains: string[];
  /** 排除搜索域名。 */
  exclude_domains: string[];
}

/**
 * Tavily Extract API 请求体。
 */
interface TavilyExtractRequest {
  /** 待提取 URL 列表。 */
  urls: string[];
  /** 提取深度。 */
  extract_depth: TavilyExtractDepth;
  /** 输出格式。 */
  format: TavilyExtractFormat;
  /** 是否包含图片。 */
  include_images: boolean;
  /** 可选的重排意图查询。 */
  query?: string;
}

/** Tavily API 请求体联合类型。 */
type TavilyRequestPayload = TavilySearchRequest | TavilyExtractRequest;

/**
 * 判断值是否为普通记录对象。
 * @param value - 待判断值
 * @returns 是否为普通记录对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 从 Tavily 错误响应中读取可展示错误信息。
 * @param payload - Tavily 响应体
 * @returns 错误信息，不存在时返回 null
 */
function readTavilyErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  for (const key of ['detail', 'error', 'message']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

/**
 * 读取 Tavily JSON 响应体。
 * @param response - fetch 响应
 * @returns JSON 响应，非 JSON 时返回原始文本
 */
async function readTavilyResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * 调用 Tavily JSON API。
 * @param endpoint - Tavily API 端点
 * @param apiKey - Tavily API Key
 * @param payload - 请求体
 * @param abortSignal - 可选中止信号
 * @returns Tavily JSON 响应
 */
async function postTavilyJson(endpoint: TavilyEndpoint, apiKey: string, payload: TavilyRequestPayload, abortSignal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${TAVILY_API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: abortSignal
  });
  const body = await readTavilyResponseBody(response);

  if (!response.ok) {
    const message = readTavilyErrorMessage(body) ?? `Tavily API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

/**
 * 构建 Tavily Search 工具输入 schema。
 * @returns AI SDK flexible schema
 */
function createTavilySearchInputSchema(): FlexibleSchema<TavilySearchInput> {
  return jsonSchema({
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The web search query'
      },
      searchDepth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: "Search depth - 'basic' for quick results, 'advanced' for deeper search"
      },
      topic: {
        type: 'string',
        enum: ['general', 'news', 'finance'],
        description: 'Search category'
      },
      timeRange: {
        type: 'string',
        enum: ['day', 'month', 'year', 'd', 'y', 'm', 'week', 'w'],
        description: 'Optional time range for search results'
      },
      country: {
        type: 'string',
        description: 'Optional country code or country name for localized results'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return'
      },
      includeAnswer: {
        type: 'boolean',
        description: 'Whether to include Tavily generated answer'
      },
      includeImages: {
        type: 'boolean',
        description: 'Whether to include images'
      },
      includeDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Domains to include'
      },
      excludeDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Domains to exclude'
      }
    },
    required: ['query'],
    additionalProperties: false
  }) as FlexibleSchema<TavilySearchInput>;
}

/**
 * 构建 Tavily Search API 请求体。
 * @param input - 工具输入
 * @returns Tavily Search 请求体
 */
function createTavilySearchRequest(input: TavilySearchInput): TavilySearchRequest {
  return {
    query: input.query,
    search_depth: input.searchDepth ?? TAVILY_SEARCH_DEFAULTS.searchDepth,
    topic: input.topic ?? TAVILY_SEARCH_DEFAULTS.topic,
    ...(input.timeRange ?? TAVILY_SEARCH_DEFAULTS.timeRange ? { time_range: input.timeRange ?? TAVILY_SEARCH_DEFAULTS.timeRange } : {}),
    ...(input.country ?? TAVILY_SEARCH_DEFAULTS.country ? { country: input.country ?? TAVILY_SEARCH_DEFAULTS.country } : {}),
    max_results: input.maxResults ?? TAVILY_SEARCH_DEFAULTS.maxResults,
    include_answer: input.includeAnswer ?? TAVILY_SEARCH_DEFAULTS.includeAnswer,
    include_images: input.includeImages ?? TAVILY_SEARCH_DEFAULTS.includeImages,
    include_domains: input.includeDomains ?? TAVILY_SEARCH_DEFAULTS.includeDomains,
    exclude_domains: input.excludeDomains ?? TAVILY_SEARCH_DEFAULTS.excludeDomains
  };
}

/**
 * 创建 Tavily Search AI SDK 工具。
 * @param apiKey - Tavily API Key
 * @returns AI SDK 工具
 */
function createTavilySearchTool(apiKey: string) {
  return tool({
    description: 'Search the web for real-time, AI-optimized information using Tavily Search.',
    inputSchema: createTavilySearchInputSchema(),
    execute: async (input: TavilySearchInput, options: ToolExecutionOptions) => {
      return postTavilyJson('/search', apiKey, createTavilySearchRequest(input), options.abortSignal);
    }
  });
}

/**
 * 对外暴露单 URL 版本的 Tavily Extract 工具。
 * @param apiKey - Tavily API Key
 * @returns AI SDK 工具
 */
function createTavilyExtractTool(apiKey: string) {
  const inputSchema = jsonSchema({
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to extract content from'
      },
      extractDepth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: "Extraction depth - 'basic' for main content, 'advanced' for comprehensive extraction"
      },
      query: {
        type: 'string',
        description: 'Optional user intent query for reranking extracted content chunks'
      }
    },
    required: ['url'],
    additionalProperties: false
  }) as FlexibleSchema<TavilyExtractSingleUrlInput>;

  return tool({
    description: 'Extract clean, structured content from a single URL. Returns parsed content in markdown or text format, optimized for AI consumption.',
    inputSchema,
    execute: async ({ url, extractDepth, query }: TavilyExtractSingleUrlInput, options: ToolExecutionOptions) => {
      const request: TavilyExtractRequest = {
        urls: [url],
        extract_depth: extractDepth ?? TAVILY_EXTRACT_DEFAULTS.extractDepth,
        format: TAVILY_EXTRACT_DEFAULTS.format,
        include_images: TAVILY_EXTRACT_DEFAULTS.includeImages,
        ...(query?.trim() ? { query } : {})
      };
      return postTavilyJson('/extract', apiKey, request, options.abortSignal);
    }
  });
}

/**
 * 根据 Tavily 配置创建主进程 Tavily 工具集。
 * 配置缺失或未启用时返回空对象。
 * @param tavily - Tavily 配置
 * @returns Tavily 工具集
 */
function createTavilyHttpTools(tavily: AIRequestOptions['tavily']): ToolSet {
  if (!tavily?.enabled || !tavily.apiKey.trim()) return {};

  return {
    tavily_search: createTavilySearchTool(tavily.apiKey),
    tavily_extract: createTavilyExtractTool(tavily.apiKey)
  };
}

/**
 * 判断当前请求是否启用了主进程可直接执行的 Tavily HTTP 工具。
 * @param tavily - Tavily 配置
 * @returns 是否需要开启多步工具循环
 */
function hasTavilyHttpTools(tavily: AIRequestOptions['tavily']): boolean {
  return Boolean(tavily?.enabled && tavily.apiKey.trim());
}

/**
 * 判断当前请求是否启用了可由主进程执行的 MCP SDK 工具。
 * @param mcp - MCP 请求配置
 * @returns 是否存在可启用的 MCP server
 */
function hasMcpSdkTools(mcp: AIRequestOptions['mcp']): boolean {
  return Boolean(
    mcp?.servers.some((server) => {
      if (!server.enabled || !mcp.enabledServerIds.includes(server.id)) return false;
      if (server.transport === 'stdio') return server.command.trim().length > 0;
      return Boolean(server.url?.trim());
    })
  );
}

/**
 * 判断单个 MCP server 是否可在当前请求中运行。
 * @param server - MCP server 配置
 * @param mcp - 当前请求的 MCP 配置
 * @returns 是否可运行
 */
function isMcpServerRunnableForRequest(server: NonNullable<AIRequestOptions['mcp']>['servers'][number], mcp: NonNullable<AIRequestOptions['mcp']>): boolean {
  if (!server.enabled || !mcp.enabledServerIds.includes(server.id)) return false;
  if (server.transport === 'stdio') return server.command.trim().length > 0;
  return Boolean(server.url?.trim());
}

/**
 * 准备当前请求需要暴露的 MCP discovery 工具。
 * @param mcp - 当前请求的 MCP 配置
 * @returns 可用于注册 AI SDK 工具的 discovery 工具列表
 */
async function prepareMcpDiscoveredTools(mcp: AIRequestOptions['mcp']): Promise<MCPDiscoveredToolSnapshot[]> {
  if (!mcp) return [];

  const runnableServers = mcp.servers.filter((server) => isMcpServerRunnableForRequest(server, mcp));
  const toolGroups = await Promise.all(
    runnableServers.map(async (server): Promise<MCPDiscoveredToolSnapshot[]> => {
      // 优先复用设置页或上一轮聊天已经写入的 discovery cache，避免重复启动 server。
      const cache = getMcpDiscoveryCache(server.id);
      if (cache && !Array.isArray(cache)) {
        return cache.tools;
      }

      const result = await connectMcpServer(server);
      if (result.ok && result.cache) {
        return result.cache.tools;
      }

      log.warn(`[AIService] MCP discovery unavailable for ${server.id}:`, result.message ?? result.errorCode ?? 'unknown error');
      return [];
    })
  );

  return toolGroups.flat();
}

/**
 * 将 MCP 工具说明词追加到系统提示。
 * @param system - 原始系统提示
 * @param mcp - MCP 请求配置
 * @returns 追加后的系统提示
 */
function appendMcpToolInstructions(system: string | undefined, mcp: AIRequestOptions['mcp']): string | undefined {
  const instructions = mcp?.toolInstructions.trim();
  if (!instructions) return system;

  const mcpSection = `MCP tool usage instructions:\n${instructions}`;
  return system?.trim() ? `${system}\n\n${mcpSection}` : mcpSection;
}

/**
 * 将前端工具定义与 Tavily 工具合并为 AI SDK 兼容的工具集。
 * 合并结果为空时返回 undefined，避免向 SDK 传入空对象。
 */
async function toSdkTools(tools: AIRequestOptions['tools'], tavily: AIRequestOptions['tavily'], mcp: AIRequestOptions['mcp']): Promise<ToolSet | undefined> {
  let rendererTools: ToolSet = {};
  if (tools?.length) {
    rendererTools = Object.fromEntries(tools.map((item) => [item.name, tool({ description: item.description, inputSchema: jsonSchema(item.parameters) })]));
  }

  const mcpDiscoveredTools = await prepareMcpDiscoveredTools(mcp);

  let mcpTools: ToolSet = {};
  if (mcp && mcpDiscoveredTools.length > 0) {
    mcpTools = createMcpSdkTools(
      resolveMcpExposedTools(
        {
          servers: mcp.servers
        },
        mcp,
        mcpDiscoveredTools
      ),
      async ({ serverId, toolName, input }) => {
        const server = mcp.servers.find((item) => item.id === serverId);
        if (!server) {
          throw new Error(`MCP server not found for tool execution: ${serverId}`);
        }
        return executeMcpTool(server, toolName, input);
      }
    );
  }

  const merged: ToolSet = { ...rendererTools, ...createTavilyHttpTools(tavily), ...mcpTools };
  if (Object.keys(merged).length === 0) {
    return undefined;
  }

  return merged;
}

/**
 * 将结构化输出配置转换为 AI SDK Output 格式。
 */
function toOutput(output: AIRequestOptions['output']) {
  if (!output) return undefined;
  return Output.object({ schema: jsonSchema(output.schema), name: output.name, description: output.description });
}

/**
 * 判断是否为可预期的临时服务错误（限流 / 服务不可用）。
 */
function isExpectedTransientError(error: AIServiceError): boolean {
  return error.code === AI_ERROR_CODE.RATE_LIMITED || error.code === AI_ERROR_CODE.SERVICE_UNAVAILABLE;
}

// ─── AIService ───────────────────────────────────────────────────────────────

/**
 * AI 服务类
 * 封装模型调用能力，支持同步文本生成与流式文本生成两种模式。
 */
class AIService {
  public aiProvider: AIProviderRegistry = new AIProviderRegistry();

  private abortControllers = new Map<string, AbortController>();

  // ── AbortController 管理 ──────────────────────────────────────────────────

  abortStream(requestId: string): void {
    const controller = this.abortControllers.get(requestId);
    if (!controller) return;

    controller.abort();
    this.abortControllers.delete(requestId);
    log.info(`[AIService] Stream aborted manually for requestId: ${requestId}`);
  }

  removeController(requestId: string): void {
    this.abortControllers.delete(requestId);
  }

  /**
   * 为指定请求创建 AbortSignal，并注册到内部映射表。
   * requestId 缺失时返回 undefined。
   */
  private registerAbortSignal(requestId?: string): AbortSignal | undefined {
    if (!requestId) return undefined;

    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);
    return controller.signal;
  }

  // ── 内部辅助 ──────────────────────────────────────────────────────────────

  private createModel(createOptions: AICreateOptions, modelId: string) {
    return this.aiProvider.create(createOptions, modelId);
  }

  /**
   * 构建 generateText / streamText 共用的基础选项。
   */
  private async buildBaseOptions(createOptions: AICreateOptions, request: AIRequestOptions) {
    return {
      model: this.createModel(createOptions, request.modelId),
      system: appendMcpToolInstructions(request.system, request.mcp),
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      tools: await toSdkTools(request.tools, request.tavily, request.mcp),
      ...(hasTavilyHttpTools(request.tavily) || hasMcpSdkTools(request.mcp) ? { stopWhen: stepCountIs(5) } : {})
    };
  }

  /**
   * 统一处理 AI 调用异常：标准化错误、按类型记录日志，并返回错误元组。
   */
  private handleError(scope: string, error: unknown, providerType: AICreateOptions['providerType']): [AIServiceError] {
    const normalized = this.aiProvider.normalizeError(error, providerType);

    if (isExpectedTransientError(normalized)) {
      log.warn(`[AIService] ${scope} ${normalized.code}:`, normalized.message);
    } else {
      log.error(`[AIService] ${scope} error:`, error);
    }

    return [normalized];
  }

  // ── 公开 API ──────────────────────────────────────────────────────────────

  /**
   * 同步生成文本。
   */
  async generateText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<[AIServiceError] | [undefined, AIInvokeResult]> {
    try {
      log.info(`[AIService] generateText request:`, request);

      const baseOptions = {
        ...(await this.buildBaseOptions(createOptions, request)),
        output: toOutput(request.output)
      };

      const result = request.messages
        ? await generateText({ ...baseOptions, messages: request.messages })
        : await generateText({ ...baseOptions, prompt: request.prompt ?? '' });

      log.info(`[AIService] generateText result:`, result);

      const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = result.usage ?? {};
      return [undefined, { text: result.text, output: result.output, usage: { inputTokens, outputTokens, totalTokens } }];
    } catch (error) {
      return this.handleError('generateText', error, createOptions.providerType);
    }
  }

  /**
   * 流式生成文本。
   */
  async streamText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<[AIServiceError] | [undefined, AIStreamResult]> {
    try {
      log.info(`[AIService] streamText request:`, request);

      const baseOptions = {
        ...(await this.buildBaseOptions(createOptions, request)),
        abortSignal: this.registerAbortSignal(request.requestId)
      };

      const result = request.messages
        ? streamText({ ...baseOptions, messages: request.messages })
        : streamText({ ...baseOptions, prompt: request.prompt ?? '' });

      return [undefined, { stream: result.fullStream }];
    } catch (error) {
      return this.handleError('streamText', error, createOptions.providerType);
    }
  }
}

/** AI 服务单例 */
export const aiService = new AIService();
