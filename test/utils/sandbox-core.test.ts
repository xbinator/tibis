/**
 * @file sandbox-core.test.ts
 * @description 通用 JS 沙箱核心行为测试。
 */
import { describe, expect, it } from 'vitest';
import { runSandboxCode } from '@/utils/sandbox';

describe('runSandboxCode', (): void => {
  it('runs inner sandbox functions in strict mode', async (): Promise<void> => {
    const result = await runSandboxCode(
      {
        code: ["const fn = __sandbox.createFunction([], 'return this === undefined')", 'return fn()'].join('\n')
      },
      {
        useWorker: false
      }
    );

    expect(result.value).toBe(true);
  });
});
