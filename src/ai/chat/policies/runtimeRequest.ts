/**
 * @file runtimeRequest.ts
 * @description ChatRuntime 请求配置与 renderer 工具快照纯策略。
 */
import type { AIMCPRequestConfig, AITavilyRuntimeConfig, AIToolExecutor } from 'types/ai';
import type { ChatRuntimeSendInput } from 'types/chat-runtime';
import type { MemoryInjectionMode } from '@/ai/memory/types';
import { toTransportTools } from '@/ai/tools/stream';
import { filterMemoryTools } from './memorySelection';

/** ChatRuntime 通用请求配置。 */
export type ChatRuntimeRequestConfig = Pick<
  ChatRuntimeSendInput,
  'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'skillContentHashes' | 'tavily' | 'mcp' | 'capabilities'
>;

/**
 * Runtime 请求配置纯策略输入。
 */
export interface RuntimeRequestPolicyInput {
  /** 模型上下文窗口 */
  contextWindow: number;
  /** 已解析 system prompt */
  system?: string;
  /** 当前工作区根目录 */
  workspaceRoot?: string;
  /** 当前候选 renderer 工具 */
  candidateTools: AIToolExecutor[];
  /** Provider 是否支持工具调用 */
  toolSupport: boolean;
  /** 本轮 Memory 注入模式 */
  memoryMode?: MemoryInjectionMode;
  /** 当前 Skill 内容版本 */
  skillContentHashes: Record<string, string>;
  /** Tavily Runtime 配置 */
  tavily?: AITavilyRuntimeConfig;
  /** MCP Runtime 配置 */
  mcp?: AIMCPRequestConfig;
}

/**
 * Runtime 请求配置纯策略结果。
 */
export interface RuntimeRequestPolicyResult {
  /** 主进程 Runtime 请求配置 */
  config: ChatRuntimeRequestConfig;
  /** Runtime 启动时需要冻结的 renderer 工具 */
  rendererTools: AIToolExecutor[];
  /** 是否向模型暴露 edit_memory */
  editMemoryExposed: boolean;
}

/**
 * 构建 Runtime 请求配置和 renderer 工具快照。
 * @param input - 已解析的请求依赖
 * @returns Runtime 请求策略结果
 */
export function buildRuntimeRequestConfig(input: RuntimeRequestPolicyInput): RuntimeRequestPolicyResult {
  const rendererTools = input.toolSupport ? filterMemoryTools(input.candidateTools, input.memoryMode) : [];

  return {
    config: {
      contextWindow: input.contextWindow,
      system: input.system,
      workspaceRoot: input.workspaceRoot,
      tools: input.toolSupport ? toTransportTools(rendererTools) : undefined,
      skillContentHashes: input.skillContentHashes,
      tavily: input.tavily,
      mcp: input.mcp
    },
    rendererTools,
    editMemoryExposed: rendererTools.some((tool: AIToolExecutor): boolean => tool.definition.name === 'edit_memory')
  };
}
