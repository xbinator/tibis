/**
 * @file toolPermission.ts
 * @description AI 工具权限 Store，管理权限模式与授权记录。
 */
import { defineStore } from 'pinia';
import { loadPersistedState, persistState } from '@/stores/helpers/persist';
import type { PersistConfig } from '@/stores/helpers/types';

export type ToolPermissionMode = 'ask' | 'readonly' | 'autoSafe';
export type ToolPermissionGrantScope = 'session' | 'always';

const TOOL_PERMISSION_STORAGE_KEY = 'tool_permission';
const LEGACY_SETTINGS_STORAGE_KEY = 'app_settings';

interface PersistedToolPermissionState {
  /** AI 工具权限模式 */
  toolPermissionMode: ToolPermissionMode;
  /** 持久化的 AI 工具始终允许授权 */
  alwaysToolPermissionGrants: Record<string, true>;
}

interface ToolPermissionState extends PersistedToolPermissionState {
  /** 当前页面生命周期内的 AI 工具授权 */
  sessionToolPermissionGrants: Record<string, true>;
}

const DEFAULT_TOOL_PERMISSION: PersistedToolPermissionState = {
  toolPermissionMode: 'ask',
  alwaysToolPermissionGrants: {}
};

function isToolPermissionMode(value: unknown): value is ToolPermissionMode {
  return value === 'ask' || value === 'readonly' || value === 'autoSafe';
}

function normalizeToolPermission(value: unknown): PersistedToolPermissionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TOOL_PERMISSION };
  }

  const state = value as Partial<PersistedToolPermissionState>;
  const normalized = { ...DEFAULT_TOOL_PERMISSION };

  if (isToolPermissionMode(state.toolPermissionMode)) {
    normalized.toolPermissionMode = state.toolPermissionMode;
  }

  if (
    state.alwaysToolPermissionGrants &&
    typeof state.alwaysToolPermissionGrants === 'object' &&
    !Array.isArray(state.alwaysToolPermissionGrants)
  ) {
    normalized.alwaysToolPermissionGrants = state.alwaysToolPermissionGrants as Record<string, true>;
  }

  return normalized;
}

const TOOL_PERMISSION_CONFIG: PersistConfig<PersistedToolPermissionState> = {
  storageKey: TOOL_PERMISSION_STORAGE_KEY,
  defaults: DEFAULT_TOOL_PERMISSION,
  normalize: normalizeToolPermission,
  migrations: [
    {
      legacyKey: LEGACY_SETTINGS_STORAGE_KEY,
      migrate: (legacyValue: unknown): Record<string, unknown> => {
        const settings = legacyValue as Record<string, unknown>;
        return {
          toolPermissionMode: settings.toolPermissionMode,
          alwaysToolPermissionGrants: settings.alwaysToolPermissionGrants
        };
      }
    }
  ]
};

export const useToolPermissionStore = defineStore('toolPermission', {
  state: (): ToolPermissionState => ({
    ...loadPersistedState(TOOL_PERMISSION_CONFIG),
    sessionToolPermissionGrants: {}
  }),

  actions: {
    /**
     * 持久化当前状态。
     */
    persist(): void {
      persistState(TOOL_PERMISSION_CONFIG.storageKey, {
        toolPermissionMode: this.toolPermissionMode,
        alwaysToolPermissionGrants: this.alwaysToolPermissionGrants
      });
    },

    /**
     * 设置 AI 工具权限模式。
     * @param mode - 工具权限模式
     */
    setToolPermissionMode(mode: ToolPermissionMode): void {
      this.toolPermissionMode = mode;
      this.persist();
    },

    /**
     * 授权指定 AI 工具。
     * @param toolName - 工具名称
     * @param scope - 授权范围
     */
    grantToolPermission(toolName: string, scope: ToolPermissionGrantScope): void {
      if (scope === 'session') {
        this.sessionToolPermissionGrants[toolName] = true;
        return;
      }

      this.alwaysToolPermissionGrants[toolName] = true;
      delete this.sessionToolPermissionGrants[toolName];
      this.persist();
    },

    /**
     * 撤销指定 AI 工具授权。
     * @param toolName - 工具名称
     */
    revokeToolPermission(toolName: string): void {
      delete this.alwaysToolPermissionGrants[toolName];
      delete this.sessionToolPermissionGrants[toolName];
      this.persist();
    },

    /**
     * 清除全部 AI 工具授权。
     */
    clearToolPermissionGrants(): void {
      this.alwaysToolPermissionGrants = {};
      this.sessionToolPermissionGrants = {};
      this.persist();
    },

    /**
     * 清除当前页面生命周期内的 AI 工具授权。
     */
    clearSessionToolPermissionGrants(): void {
      this.sessionToolPermissionGrants = {};
    }
  }
});
