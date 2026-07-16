/**
 * @file root-alias.test.ts
 * @description 仓库根路径别名解析测试。
 */
import { describe, expect, it } from 'vitest';
import type { SharedToolSource } from '@@/shared/ai/tools/types.ts';

describe('root path alias', (): void => {
  it('resolves shared modules from @@ alias', (): void => {
    const source: SharedToolSource = 'builtin';

    expect(source).toBe('builtin');
  });
});
