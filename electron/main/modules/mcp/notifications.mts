/**
 * @file notifications.mts
 * @description MCP 通知处理器注册。
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ToolListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  PromptListChangedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP 通知回调集合。
 */
export interface NotificationHandlers {
  /** 工具列表变更回调 */
  onToolsChanged?: (serverId: string) => void;
  /** 资源列表变更回调 */
  onResourcesChanged?: (serverId: string) => void;
  /** Prompt 列表变更回调 */
  onPromptsChanged?: (serverId: string) => void;
}

/**
 * 注册 MCP 通知处理器。
 * @param client - SDK Client 实例
 * @param serverId - MCP server ID
 * @param handlers - 通知回调集合
 */
export function registerNotificationHandlers(client: Client, serverId: string, handlers: NotificationHandlers): void {
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    handlers.onToolsChanged?.(serverId);
  });

  client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
    handlers.onResourcesChanged?.(serverId);
  });

  client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
    handlers.onPromptsChanged?.(serverId);
  });
}
