/**
 * @file types.ts
 * @description stores 共享类型定义，主要用于持久化中间层。
 */

/** 迁移步骤：从旧存储键读取并转换为新格式 */
export interface MigrationStep {
  /** 旧存储键名 */
  legacyKey: string;
  /** 从旧值转换为新格式的函数 */
  migrate: (legacyValue: unknown) => Record<string, unknown>;
}

/** 持久化 Store 配置 */
export interface PersistConfig<T> {
  /** 存储键名 */
  storageKey: string;
  /** 默认值 */
  defaults: T;
  /** 值归一化函数，确保读取的数据结构合法 */
  normalize: (value: unknown) => T;
  /** 旧版迁移步骤列表，按顺序执行，首个成功即停止 */
  migrations?: MigrationStep[];
}
