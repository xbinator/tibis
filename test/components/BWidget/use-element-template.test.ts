/**
 * @file use-element-template.test.ts
 * @description 验证 BWidget 元素模板 hook 的读取与写入行为。
 */
import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useElementTemplate } from '@/components/BWidget/hooks/useElementTemplate';
import type { WidgetElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 创建测试元素。
 * @returns 测试元素
 */
function createTextElement(): WidgetElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '文本名称',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 24 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {
      content: '静态内容',
      subtitle: '副标题'
    }
  };
}

describe('useElementTemplate', (): void => {
  it('reads and writes the default content metadata field', (): void => {
    const element = createTextElement();
    const field = useElementTemplate(ref(element), 'content');

    expect(field.value).toBe('静态内容');

    field.value = '城市：{{ $input.city }}';

    expect(element.metadata.content).toBe('城市：{{ $input.city }}');
  });

  it('does not read unrelated metadata as the field value', (): void => {
    const element = createTextElement();
    element.metadata.helperText = '{{ weather.temperature }}°C';
    const field = useElementTemplate(ref(element), 'content');

    expect(field.value).toBe('静态内容');
  });

  it('uses an empty string when the default content metadata field is missing', (): void => {
    const element = createTextElement();
    delete element.metadata.content;
    const field = useElementTemplate(ref(element), 'content');

    expect(field.value).toBe('');
  });

  it('supports an explicit field name for secondary template content', (): void => {
    const element = createTextElement();
    const field = useElementTemplate(ref(element), 'subtitle');

    expect(field.value).toBe('副标题');

    field.value = '新副标题：{{ $input.city }}';

    expect(element.metadata.subtitle).toBe('新副标题：{{ $input.city }}');
  });
});
