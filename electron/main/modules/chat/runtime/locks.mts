/**
 * @file locks.mts
 * @description ChatRuntime session 级写入锁。
 */

/** 锁获取成功结果。 */
export interface RuntimeLockAcquired {
  /** 是否成功获取锁。 */
  ok: true;
}

/** 锁获取失败结果。 */
export interface RuntimeLockRejected {
  /** 是否成功获取锁。 */
  ok: false;
  /** 当前占用锁的 runtime id。 */
  ownerRuntimeId: string;
  /** 稳定失败原因。 */
  reason: 'session_busy';
}

/** 写入锁获取结果。 */
export type RuntimeLockResult = RuntimeLockAcquired | RuntimeLockRejected;

/** Runtime 写入锁注册表。 */
export interface RuntimeLockRegistry {
  /**
   * 获取 session 写入锁。
   * @param input - session 与 runtime 标识
   * @returns 锁获取结果
   */
  acquireWritingLock(input: { sessionId: string; runtimeId: string }): RuntimeLockResult;
  /**
   * 释放 session 写入锁。
   * @param input - session 与 runtime 标识
   * @returns 是否释放成功
   */
  releaseWritingLock(input: { sessionId: string; runtimeId: string }): boolean;
  /**
   * 读取当前 session 写入锁 owner。
   * @param sessionId - session id
   * @returns 当前 owner runtime id
   */
  getWritingOwner(sessionId: string): string | undefined;
}

/**
 * 创建内存写入锁注册表。
 * @returns runtime 写入锁注册表
 */
export function createRuntimeLockRegistry(): RuntimeLockRegistry {
  const writingLocks = new Map<string, string>();

  return {
    acquireWritingLock(input: { sessionId: string; runtimeId: string }): RuntimeLockResult {
      const ownerRuntimeId = writingLocks.get(input.sessionId);
      if (ownerRuntimeId && ownerRuntimeId !== input.runtimeId) {
        return { ok: false, ownerRuntimeId, reason: 'session_busy' };
      }

      writingLocks.set(input.sessionId, input.runtimeId);
      return { ok: true };
    },

    releaseWritingLock(input: { sessionId: string; runtimeId: string }): boolean {
      if (writingLocks.get(input.sessionId) !== input.runtimeId) {
        return false;
      }

      writingLocks.delete(input.sessionId);
      return true;
    },

    getWritingOwner(sessionId: string): string | undefined {
      return writingLocks.get(sessionId);
    }
  };
}
