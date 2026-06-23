/**
 * @file chip-resolver.test.ts
 * @description 验证聊天输入框文件引用 chip 的图标渲染与打开行为。
 * @vitest-environment jsdom
 */
import type { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { createFileRefChipResolver } from '@/components/BChat/utils/chipResolver';

const bRecentIconModuleMock = vi.hoisted(() => ({
  default: {
    name: 'BRecentIcon',
    props: {
      fileName: {
        type: String,
        default: ''
      },
      size: {
        type: [Number, String],
        default: ''
      }
    },
    template: '<i class="b-recent-icon-stub" :data-file-name="fileName" :data-size="size"></i>'
  }
}));

vi.mock('@/components/BRecent/Icon.vue', () => bRecentIconModuleMock);

describe('createFileRefChipResolver', (): void => {
  it('renders file reference widgets with the shared recent icon component', (): void => {
    const resolver = createFileRefChipResolver(vi.fn());
    const result = resolver('#package.json');

    if (!result || !('widget' in result)) {
      throw new Error('Expected file reference widget result');
    }

    const element = result.widget.toDOM(undefined as unknown as EditorView);
    const icon = element.querySelector('.b-recent-icon-stub');

    expect(icon?.getAttribute('data-file-name')).toBe('package.json');
    expect(icon?.getAttribute('data-size')).toBe('14');

    result.widget.destroy(element);
  });
});
