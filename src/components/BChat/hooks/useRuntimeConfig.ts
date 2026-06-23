/**
 * @file useRuntimeConfig.ts
 * @description ChatRuntime 请求配置解析 hook。
 */
import type { AIMCPRequestConfig, AITavilyRuntimeConfig } from 'types/ai';
import { useMemoryStore } from '@/stores/ai/memory';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';

/**
 * Runtime 配置 hook 返回值。
 */
interface UseRuntimeConfigReturn {
  /** 解析 runtime system prompt 上下文。 */
  resolveRuntimeSystemPrompt: () => Promise<string | undefined>;
  /** 解析可交给主进程执行的 Tavily 配置。 */
  resolveRuntimeTavilyConfig: () => AITavilyRuntimeConfig | undefined;
  /** 解析可交给主进程执行的 MCP 配置。 */
  resolveRuntimeMcpRequestConfig: () => AIMCPRequestConfig | undefined;
}

/**
 * 判断 MCP server 是否可在主进程执行。
 * @param server - MCP server 配置
 * @returns 是否可执行
 */
function isRuntimeEnabledMcpServer(server: AIMCPRequestConfig['servers'][number]): boolean {
  if (!server.enabled) return false;
  if (server.transport === 'stdio') return server.command.trim().length > 0;

  return Boolean(server.url?.trim());
}

/**
 * 管理 ChatRuntime 的 system prompt、Tavily 和 MCP 请求配置。
 * @returns Runtime 配置解析方法
 */
export function useRuntimeConfig(): UseRuntimeConfigReturn {
  const memoryStore = useMemoryStore();
  const toolSettingsStore = useToolSettingsStore();

  /**
   * 解析 runtime system prompt 上下文。
   * @returns system prompt
   */
  async function resolveRuntimeSystemPrompt(): Promise<string | undefined> {
    if (!memoryStore.loaded) {
      await memoryStore.loadMemory();
    }

    const memoryContext = memoryStore.buildSystemPromptContext();
    return memoryContext.trim() ? memoryContext : undefined;
  }

  /**
   * 解析可交给主进程执行的 Tavily 配置。
   * @returns Tavily runtime 配置
   */
  function resolveRuntimeTavilyConfig(): AITavilyRuntimeConfig | undefined {
    const { tavily } = toolSettingsStore;
    if (!tavily?.enabled || !tavily.apiKey.trim()) return undefined;

    return {
      enabled: tavily.enabled,
      apiKey: tavily.apiKey
    };
  }

  /**
   * 解析可交给主进程执行的 MCP 配置。
   * @returns MCP runtime 请求配置
   */
  function resolveRuntimeMcpRequestConfig(): AIMCPRequestConfig | undefined {
    const servers = toolSettingsStore.mcp.servers.filter(isRuntimeEnabledMcpServer).map((server) => ({
      ...server,
      args: [...server.args],
      env: { ...server.env },
      headers: { ...server.headers },
      toolAllowlist: [...server.toolAllowlist]
    }));
    if (!servers.length) return undefined;

    return {
      servers,
      enabledServerIds: servers.map((server) => server.id),
      enabledTools: [],
      toolInstructions: ''
    };
  }

  return {
    resolveRuntimeSystemPrompt,
    resolveRuntimeTavilyConfig,
    resolveRuntimeMcpRequestConfig
  };
}
