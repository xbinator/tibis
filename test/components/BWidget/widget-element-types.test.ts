/**
 * @file widget-element-types.test.ts
 * @description 验证 BWidget 元素实例类型与注册配置的 metadata 泛型透传。
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { WidgetElementSchema } from '@/components/BWidget/elements';
import type { WidgetImageElementMetadata } from '@/components/BWidget/elements/Image/schema';
import type { WidgetTextElementMetadata } from '@/components/BWidget/elements/Text/schema';
import type { WidgetAddShapeOptions, WidgetData, WidgetElement, WidgetMetadata, WidgetShapeElement } from '@/components/BWidget/types';

/**
 * 测试用 Widget 顶层 metadata。
 */
interface TestWidgetMetadata extends WidgetMetadata {
  /** 运行态宽度 */
  width?: number;
  /** 运行态高度 */
  height?: number;
  /** 自定义标识 */
  custom: string;
}

describe('Widget element metadata types', (): void => {
  it('keeps element instance metadata generic', (): void => {
    expectTypeOf<WidgetElement<WidgetTextElementMetadata>['metadata']>().toEqualTypeOf<WidgetTextElementMetadata>();
    expectTypeOf<WidgetShapeElement<WidgetImageElementMetadata>['metadata']>().toEqualTypeOf<WidgetImageElementMetadata>();
    expectTypeOf<WidgetAddShapeOptions<WidgetImageElementMetadata>['metadata']>().toEqualTypeOf<WidgetImageElementMetadata | undefined>();
  });

  it('keeps widget data metadata generic', (): void => {
    expectTypeOf<WidgetData<TestWidgetMetadata>['metadata']>().toEqualTypeOf<TestWidgetMetadata>();
  });

  it('keeps schema render size measurement aligned with metadata generic', (): void => {
    expectTypeOf<NonNullable<WidgetElementSchema<WidgetTextElementMetadata>['renderSize']>['measureContent']>()
      .parameter(0)
      .toEqualTypeOf<WidgetShapeElement<WidgetTextElementMetadata>>();
  });
});
