/**
 * @file persist.ts
 * @description 通用 localStorage 持久化工具，统一加载/归一化/迁移/写入模式。
 */
import type { PersistConfig } from './types';
import { local } from '@/shared/storage/base';

/**
 * 加载持久化数据，支持归一化和旧版迁移。
 * 优先从主键读取并归一化；主键不存在时依次尝试迁移步骤。
 * @param config - 持久化配置
 * @returns 加载并归一化后的状态
 */
export function loadPersistedState<T>(config: PersistConfig<T>): T {
  const saved = local.getItem<unknown>(config.storageKey);
  if (saved !== null && saved !== undefined) {
    const normalized = config.normalize(saved);
    local.setItem(config.storageKey, normalized);
    return normalized;
  }

  if (config.migrations) {
    for (const step of config.migrations) {
      const legacyValue = local.getItem<unknown>(step.legacyKey);
      if (legacyValue !== null && legacyValue !== undefined) {
        const migrated = config.normalize(step.migrate(legacyValue));
        local.setItem(config.storageKey, migrated);
        local.removeItem(step.legacyKey);
        return migrated;
      }
    }
  }

  return { ...config.defaults };
}

/**
 * 持久化当前状态到 localStorage。
 * @param storageKey - 存储键名
 * @param state - 待持久化的状态
 */
export function persistState<T>(storageKey: string, state: T): void {
  local.setItem(storageKey, state);
}
