/**
 * @file locks.test.ts
 * @description ChatRuntime session 写入锁测试。
 */
import { describe, expect, it } from 'vitest';
import { createRuntimeLockRegistry } from '../../../../../../electron/main/modules/chat/runtime/infrastructure/locks.mjs';

describe('chat runtime locks', (): void => {
  it('allows one writing runtime per session', (): void => {
    const locks = createRuntimeLockRegistry();

    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r1' }).ok).toBe(true);
    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r2' })).toEqual({
      ok: false,
      ownerRuntimeId: 'r1',
      reason: 'session_busy'
    });
  });

  it('allows different sessions to run independently', (): void => {
    const locks = createRuntimeLockRegistry();

    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r1' }).ok).toBe(true);
    expect(locks.acquireWritingLock({ sessionId: 's2', runtimeId: 'r2' }).ok).toBe(true);
  });

  it('releases only the owning runtime', (): void => {
    const locks = createRuntimeLockRegistry();

    locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r1' });
    expect(locks.releaseWritingLock({ sessionId: 's1', runtimeId: 'r2' })).toBe(false);
    expect(locks.releaseWritingLock({ sessionId: 's1', runtimeId: 'r1' })).toBe(true);
    expect(locks.acquireWritingLock({ sessionId: 's1', runtimeId: 'r3' }).ok).toBe(true);
  });
});
