/**
 * @file service.mts
 * @description AI 服务核心类，封装文本生成和流式文本生成能力
 */
import type { FlexibleSchema, ToolExecutionOptions, ToolSet } from 'ai';
import type { AICreateOptions, AIRequestOptions, AIInvokeResult, AIStreamResult, AIServiceError, MCPDiscoveredToolSnapshot } from 'types/ai';
import { tavilyExtract, tavilySearch } from '@tavily/ai-sdk';
import { generateText, jsonSchema, Output, stepCountIs, streamText, tool } from 'ai';
import { log } from '../logger/service.mjs';
import { connectMcpServer, executeMcpTool, getMcpDiscoveryCache } from '../mcp/session.mjs';
import { createMcpSdkTools, resolveMcpExposedTools } from '../mcp/tools.mjs';
import { AI_ERROR_CODE } from './errors/codes.mjs';
import { AIProviderRegistry } from './providers/_index.mjs';

// ─── 纯工具函数 ──────────────────────────────────────────────────────────────

/**
 * Tavily Search 硬编码默认参数。
 */
const TAVILY_SEARCH_DEFAULTS = {
  searchDepth: 'basic' as const,
  topic: 'general' as const,
  timeRange: undefined as 'day' | 'month' | 'year' | 'd' | 'y' | 'm' | 'week' | 'w' | undefined,
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
  extractDepth: 'basic' as const,
  format: 'markdown' as const,
  includeImages: false
};

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
 * 对外暴露单 URL 版本的 Tavily Extract 工具。
 * @description SDK 原生工具要求 `urls: string[]`，这里收敛成第一版产品约定的单 `url` 输入。
 */
function createTavilyExtractTool(apiKey: string) {
  const sdkTool = tavilyExtract({
    apiKey,
    includeImages: TAVILY_EXTRACT_DEFAULTS.includeImages,
    extractDepth: TAVILY_EXTRACT_DEFAULTS.extractDepth,
    format: TAVILY_EXTRACT_DEFAULTS.format
  });
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
      return sdkTool.execute?.({ urls: [url], extractDepth, query }, options);
    }
  });
}

/**
 * 根据 Tavily 配置创建 SDK 工具集。
 * 配置缺失或未启用时返回空对象。
 */
function createTavilySdkTools(tavily: AIRequestOptions['tavily']): ToolSet {
  if (!tavily?.enabled || !tavily.apiKey.trim()) return {};

  return {
    tavily_search: tavilySearch({
      apiKey: tavily.apiKey,
      topic: TAVILY_SEARCH_DEFAULTS.topic,
      country: TAVILY_SEARCH_DEFAULTS.country,
      maxResults: TAVILY_SEARCH_DEFAULTS.maxResults,
      includeAnswer: TAVILY_SEARCH_DEFAULTS.includeAnswer,
      includeImages: TAVILY_SEARCH_DEFAULTS.includeImages,
      includeDomains: TAVILY_SEARCH_DEFAULTS.includeDomains,
      excludeDomains: TAVILY_SEARCH_DEFAULTS.excludeDomains,
      searchDepth: TAVILY_SEARCH_DEFAULTS.searchDepth,
      timeRange: TAVILY_SEARCH_DEFAULTS.timeRange
    }),
    tavily_extract: createTavilyExtractTool(tavily.apiKey)
  };
}

/**
 * 判断当前请求是否启用了主进程可直接执行的 Tavily SDK 工具。
 * @param tavily - Tavily 配置
 * @returns 是否需要开启 SDK 多步工具循环
 */
function hasTavilySdkTools(tavily: AIRequestOptions['tavily']): boolean {
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

  const merged: ToolSet = { ...rendererTools, ...createTavilySdkTools(tavily), ...mcpTools };
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
      ...(hasTavilySdkTools(request.tavily) || hasMcpSdkTools(request.mcp) ? { stopWhen: stepCountIs(5) } : {})
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
