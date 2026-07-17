/**
 * @file chip-resolver.test.ts
 * @description 验证聊天输入框文件引用 chip 的图标渲染与打开行为。
 * @vitest-environment jsdom
 */
import type { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { createChatChipResolver, createFileRefChipResolver } from '@/components/BChat/utils/chipResolver';
import { createFileReferenceWidget } from '@/components/BChat/utils/chipResolver/file/widget';
import { createSkillReferenceWidget } from '@/components/BChat/utils/chipResolver/skill/widget';

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
  it('exposes file and skill widgets from scoped resolver folders', (): void => {
    expect(createFileReferenceWidget).toBeTypeOf('function');
    expect(createSkillReferenceWidget).toBeTypeOf('function');
  });

  it('renders file reference widgets with the shared recent icon component', (): void => {
    const resolver = createFileRefChipResolver(vi.fn());
    const result = resolver('@package.json');

    if (!result || !('widget' in result)) {
      throw new Error('Expected file reference widget result');
    }

    const element = result.widget.toDOM(undefined as unknown as EditorView);
    const icon = element.querySelector('.b-recent-icon-stub');

    expect(icon?.getAttribute('data-file-name')).toBe('package.json');
    expect(icon?.getAttribute('data-size')).toBe('14');

    result.widget.destroy(element);
  });

  it('does not reuse widgets for same-name files at different paths', (): void => {
    const resolver = createFileRefChipResolver(vi.fn());
    const sourceWidget = resolver('@src/foo.ts');
    const libraryWidget = resolver('@lib/foo.ts');

    if (!sourceWidget || !libraryWidget || !('widget' in sourceWidget) || !('widget' in libraryWidget)) {
      throw new Error('Expected file reference widgets');
    }

    expect(sourceWidget.widget.eq(libraryWidget.widget)).toBe(false);
  });

  it('renders skill reference tokens as iconless name widgets', (): void => {
    const resolver = createChatChipResolver(vi.fn());
    const result = resolver('$天气 / 中文');

    if (!result || !('widget' in result)) {
      throw new Error('Expected skill reference widget result');
    }

    const element = result.widget.toDOM(undefined as unknown as EditorView);

    expect(element.classList.contains('b-skill-reference')).toBe(true);
    expect(element.querySelector('.b-skill-reference__icon')).toBeNull();
    expect(element.querySelector('svg')).toBeNull();
    expect(element.querySelector('.b-skill-reference__name')?.textContent).toBe('天气 / 中文');
    result.widget.destroy(element);
  });
});
