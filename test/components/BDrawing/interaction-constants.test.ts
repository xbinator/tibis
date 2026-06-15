/**
 * @file interaction-constants.test.ts
 * @description 验证 BDrawing 交互常量符合画布选择体验预期。
 */
import { describe, expect, it } from 'vitest';
import { DRAWING_MOVEABLE_SELECTION_PADDING } from '../../../src/components/BDrawing/constants/interaction';

describe('BDrawing interaction constants', (): void => {
  it('keeps Moveable selection padding compact on every side', (): void => {
    expect(DRAWING_MOVEABLE_SELECTION_PADDING).toEqual({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0
    });
  });
});
