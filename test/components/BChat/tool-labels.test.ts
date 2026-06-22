/**
 * @file tool-labels.test.ts
 * @description 验证聊天工具调用的用户可读名称。
 */
import { describe, expect, it } from 'vitest';
import { getActionLabel } from '@/components/BChat/utils/toolLabels';

describe('toolLabels', (): void => {
  it('labels operate_webpage as a current webpage operation', (): void => {
    expect(getActionLabel('operate_webpage')).toEqual({ alias: '操作当前网页' });
  });
});
