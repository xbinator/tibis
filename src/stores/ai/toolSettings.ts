/**
 * @file toolSettings.ts
 * @description Tavily 工具设置 Store，负责持久化配置与可用性派生状态。
 */
import { defineStore } from 'pinia';
import { toolSettingsStorage } from '@/shared/storage';
import type { MCPServerConfig, MCPToolSettings, TavilyToolSettings } from '@/shared/storage/tool-settings';

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
  state: (): ToolSettingsStoreState => {
    const settings = toolSettingsStorage.getSettings();
    return {
      tavily: settings.tavily,
      mcp: settings.mcp
    };
  },

  getters: {
    /**
     * Tavily 当前是否可注册到聊天工具链。
     * @param state - Store 状态
     * @returns 是否可用
     */
    isTavilyAvailable: (state): boolean => state.tavily.enabled && state.tavily.apiKey.trim().length > 0,

    /**
     * 是否存在已启用且配置完整的 MCP server。
     * @param state - Store 状态
     * @returns 是否存在可运行的 MCP server 配置
     */
    hasEnabledMcpServers: (state): boolean =>
      state.mcp.servers.some((server) => {
        if (!server.enabled) return false;
        if (server.transport === 'stdio') return server.command.trim().length > 0;
        return Boolean(server.url?.trim());
      }),

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
     * 从持久化层加载完整工具设置。
     */
    async loadSettings(): Promise<void> {
      const normalized = await toolSettingsStorage.loadSettings();
      this.tavily = normalized.tavily;
      this.mcp = normalized.mcp;
    },

    /**
     * 持久化当前工具设置状态。
     */
    async saveSettings(): Promise<void> {
      const normalized = await toolSettingsStorage.saveSettings({ tavily: this.tavily, mcp: this.mcp });
      this.tavily = normalized.tavily;
      this.mcp = normalized.mcp;
    },

    /**
     * 设置 Tavily 启用状态。
     * @param enabled - 是否启用
     */
    async setTavilyEnabled(enabled: boolean): Promise<void> {
      this.tavily.enabled = enabled;
      await this.saveSettings();
    },

    /**
     * 设置 Tavily API Key。
     * @param apiKey - API Key
     */
    async setTavilyApiKey(apiKey: string): Promise<void> {
      this.tavily.apiKey = apiKey;
      await this.saveSettings();
    },

    /**
     * 新增 MCP server 配置。
     * @param server - 待新增的 MCP server
     */
    async addMcpServer(server: MCPServerConfig): Promise<void> {
      this.mcp.servers = [...this.mcp.servers, server];
      await this.saveSettings();
    },

    /**
     * 更新指定 MCP server 配置。
     * @param serverId - MCP server ID
     * @param patch - 需要合并的 server 配置
     */
    async updateMcpServer(serverId: string, patch: Partial<MCPServerConfig>): Promise<void> {
      this.mcp.servers = this.mcp.servers.map((server) => (server.id === serverId ? { ...server, ...patch, id: server.id } : server));
      await this.saveSettings();
    },

    /**
     * 删除 MCP server。
     * @param serverId - MCP server ID
     */
    async removeMcpServer(serverId: string): Promise<void> {
      this.mcp.servers = this.mcp.servers.filter((server) => server.id !== serverId);
      await this.saveSettings();
    }
  }
});
