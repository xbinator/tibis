/**
 * @file toolSettings.ts
 * @description Tavily 工具设置 Store，负责持久化配置与可用性派生状态。
 */
import { defineStore } from 'pinia';
import { toolSettingsStorage } from '@/shared/storage';
import type { MCPServerConfig, MCPToolSettings, TavilyExtractDefaults, TavilySearchDefaults, TavilyToolSettings } from '@/shared/storage/tool-settings';

/**
 * 工具设置 Store 状态。
 */
interface ToolSettingsStoreState {
  /** Tavily 配置 */
  tavily: TavilyToolSettings;
  /** MCP 配置 */
  mcp: MCPToolSettings;
}

/**
 * Tavily 工具设置 Store。
 */
export const useToolSettingsStore = defineStore('toolSettings', {
  state: (): ToolSettingsStoreState => ({
    tavily: toolSettingsStorage.getSettings().tavily,
    mcp: toolSettingsStorage.getSettings().mcp
  }),

  getters: {
    /**
     * Tavily 当前是否可注册到聊天工具链。
     * @param state - Store 状态
     * @returns 是否可用
     */
    isTavilyAvailable: (state): boolean => state.tavily.enabled && state.tavily.apiKey.trim().length > 0,

    /**
     * 是否存在已启用且命令完整的 MCP server。
     * @param state - Store 状态
     * @returns 是否存在可运行的 MCP server 配置
     */
    hasEnabledMcpServers: (state): boolean => state.mcp.servers.some((server) => server.enabled && server.command.trim().length > 0),

    /**
     * 按 ID 查询 MCP server。
     * @param state - Store 状态
     * @returns 查询函数
     */
    getMcpServerById: (state): ((serverId: string) => MCPServerConfig | undefined) => {
      return (serverId: string): MCPServerConfig | undefined => state.mcp.servers.find((server) => server.id === serverId);
    }
  },

  actions: {
    /**
     * 持久化当前 Tavily 状态。
     */
    saveSettings(): void {
      const normalized = toolSettingsStorage.saveSettings({ tavily: this.tavily, mcp: this.mcp });
      this.tavily = normalized.tavily;
      this.mcp = normalized.mcp;
    },

    /**
     * 设置 Tavily 启用状态。
     * @param enabled - 是否启用
     */
    setTavilyEnabled(enabled: boolean): void {
      this.tavily.enabled = enabled;
      this.saveSettings();
    },

    /**
     * 设置 Tavily API Key。
     * @param apiKey - API Key
     */
    setTavilyApiKey(apiKey: string): void {
      this.tavily.apiKey = apiKey;
      this.saveSettings();
    },

    /**
     * 更新 Search 默认参数。
     * @param patch - 需要合并的 Search 默认参数
     */
    updateTavilySearchDefaults(patch: Partial<TavilySearchDefaults>): void {
      this.tavily.searchDefaults = {
        ...this.tavily.searchDefaults,
        ...patch
      };
      this.saveSettings();
    },

    /**
     * 更新 Extract 默认参数。
     * @param patch - 需要合并的 Extract 默认参数
     */
    updateTavilyExtractDefaults(patch: Partial<TavilyExtractDefaults>): void {
      this.tavily.extractDefaults = {
        ...this.tavily.extractDefaults,
        ...patch
      };
      this.saveSettings();
    },

    /**
     * 新增 MCP server 配置。
     * @param server - 待新增的 MCP server
     */
    addMcpServer(server: MCPServerConfig): void {
      this.mcp.servers = [...this.mcp.servers, server];
      this.saveSettings();
    },

    /**
     * 更新指定 MCP server 配置。
     * @param serverId - MCP server ID
     * @param patch - 需要合并的 server 配置
     */
    updateMcpServer(serverId: string, patch: Partial<MCPServerConfig>): void {
      this.mcp.servers = this.mcp.servers.map((server) => (server.id === serverId ? { ...server, ...patch, id: server.id } : server));
      this.saveSettings();
    },

    /**
     * 删除 MCP server。
     * @param serverId - MCP server ID
     */
    removeMcpServer(serverId: string): void {
      this.mcp.servers = this.mcp.servers.filter((server) => server.id !== serverId);
      this.saveSettings();
    }
  }
});
