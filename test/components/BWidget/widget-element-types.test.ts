/**
 * @file widget-element-types.test.ts
 * @description 验证 BWidget 元素实例类型与注册配置的 metadata 泛型透传。
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { WidgetElementSchema } from '@/components/BWidget/elements';
import type { WidgetImageElementMetadata } from '@/components/BWidget/elements/Image/schema';
import type { WidgetTextElementMetadata } from '@/components/BWidget/elements/Text/schema';
import type { WidgetAddShapeOptions, WidgetElement, WidgetShapeElement } from '@/components/BWidget/types';

describe('Widget element metadata types', (): void => {
  it('keeps element instance metadata generic', (): void => {
    expectTypeOf<WidgetElement<WidgetTextElementMetadata>['metadata']>().toEqualTypeOf<WidgetTextElementMetadata>();
    expectTypeOf<WidgetShapeElement<WidgetImageElementMetadata>['metadata']>().toEqualTypeOf<WidgetImageElementMetadata>();
    expectTypeOf<WidgetAddShapeOptions<WidgetImageElementMetadata>['metadata']>().toEqualTypeOf<WidgetImageElementMetadata | undefined>();
  });

  it('keeps schema render size measurement aligned with metadata generic', (): void => {
    expectTypeOf<NonNullable<WidgetElementSchema<WidgetTextElementMetadata>['renderSize']>['measureContent']>()
      .parameter(0)
      .toEqualTypeOf<WidgetShapeElement<WidgetTextElementMetadata>>();
  });
});
