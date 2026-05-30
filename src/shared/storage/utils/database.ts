/**
 * @file database.ts
 * @description 渲染进程数据库访问封装，统一处理启动期数据库初始化竞态。
 */
import { getElectronAPI, hasElectronAPI } from '../../platform/electron-api';

/**
 * 数据库写操作结果。
 */
interface DatabaseExecuteResult {
  /** 受影响行数 */
  changes: number;
  /** 最后一条插入记录 ID */
  lastInsertRowid: number;
}

/**
 * 启动期数据库初始化竞态的有限重试间隔。
 * 使用逐步拉长的等待，兼顾启动恢复速度和避免过久阻塞。
 */
const DATABASE_RETRY_DELAYS_MS: number[] = [10, 20, 40, 80, 120];

/**
 * 检查当前运行环境是否具备 Electron 数据库能力。
 * @returns 是否可访问 Electron 数据库 API
 */
export function isDatabaseAvailable(): boolean {
  return hasElectronAPI();
}

/**
 * 判断错误是否由主进程数据库尚未初始化引起。
 * @param error - 待判断的错误对象
 * @returns 是否为数据库未初始化错误
 */
export function isDatabaseInitializationRaceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Database not initialized');
}

/**
 * 异步等待指定毫秒数。
 * @param delayMs - 等待时长（毫秒）
 * @returns 等待完成后的 Promise
 */
async function waitForRetry(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

/**
 * 在数据库初始化竞态期间对操作进行有限重试。
 * @param operation - 需要执行的数据库操作
 * @returns 操作成功后的结果
 */
export async function retryDuringDatabaseInitialization<T>(operation: () => Promise<T>): Promise<T> {
  /**
   * 执行单次重试尝试。
   * @param attemptIndex - 当前尝试索引
   * @returns 操作成功后的结果
   */
  async function attempt(attemptIndex: number): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (!isDatabaseInitializationRaceError(error)) {
        throw error;
      }

      const delayMs = DATABASE_RETRY_DELAYS_MS[attemptIndex];
      if (delayMs === undefined) {
        throw error;
      }

      await waitForRetry(delayMs);
      return attempt(attemptIndex + 1);
    }
  }

  return attempt(0);
}

/**
 * 执行数据库查询。
 * 启动期若数据库尚未初始化，会进行有限重试；最终仍不可用时返回空结果做只读降级。
 * @param sql - SQL 查询语句
 * @param params - SQL 参数列表
 * @returns 查询结果数组
 */
export async function dbSelect<T>(sql: string, params?: unknown[]): Promise<T[]> {
  if (!isDatabaseAvailable()) {
    return [];
  }

  try {
    return await retryDuringDatabaseInitialization<T[]>(() => getElectronAPI().dbSelect<T>(sql, params));
  } catch (error: unknown) {
    if (isDatabaseInitializationRaceError(error)) {
      return [];
    }

    throw error;
  }
}

/**
 * 执行数据库写操作。
 * 启动期若数据库尚未初始化，会进行有限重试；重试后仍失败则保留真实错误语义。
 * @param sql - SQL 写操作语句
 * @param params - SQL 参数列表
 * @returns 写操作结果
 */
export async function dbExecute(sql: string, params?: unknown[]): Promise<DatabaseExecuteResult> {
  if (!isDatabaseAvailable()) {
    return { changes: 0, lastInsertRowid: 0 };
  }

  return retryDuringDatabaseInitialization<DatabaseExecuteResult>(() => getElectronAPI().dbExecute(sql, params));
}
