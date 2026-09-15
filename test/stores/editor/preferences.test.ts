/**
 * @file preferences.test.ts
 * @description 编辑器偏好持久化与代码块缩进配置测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { local } from '@/shared/storage/base';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';

describe('editor preferences store', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('uses two-space indentation for existing users without code block preferences', (): void => {
    local.setItem('editor_preferences', {
      viewMode: 'rich',
      pageWidth: 'default',
      saveStrategy: 'off',
      showOutline: false,
      monacoWordWrap: 'off'
    });

    const store = useEditorPreferencesStore();

    expect(store.codeBlockIndentStyle).toBe('spaces');
    expect(store.codeBlockIndentSize).toBe(2);
  });

  it('restores valid persisted code block indentation preferences', (): void => {
    local.setItem('editor_preferences', {
      viewMode: 'rich',
      pageWidth: 'default',
      saveStrategy: 'off',
      showOutline: false,
      monacoWordWrap: 'off',
      codeBlockIndentStyle: 'tabs',
      codeBlockIndentSize: 6
    });

    const store = useEditorPreferencesStore();

    expect(store.codeBlockIndentStyle).toBe('tabs');
    expect(store.codeBlockIndentSize).toBe(6);
  });

  it('normalizes invalid persisted code block indentation preferences', (): void => {
    local.setItem('editor_preferences', {
      codeBlockIndentStyle: 'unknown',
      codeBlockIndentSize: 99
    });

    const store = useEditorPreferencesStore();

    expect(store.codeBlockIndentStyle).toBe('spaces');
    expect(store.codeBlockIndentSize).toBe(2);
  });

  it('persists code block indentation changes', (): void => {
    const store = useEditorPreferencesStore();

    store.setIndentStyle('tabs');
    store.setIndentSize(4);

    const persisted = local.getItem<{ codeBlockIndentStyle?: string; codeBlockIndentSize?: number }>('editor_preferences');
    expect(persisted?.codeBlockIndentStyle).toBe('tabs');
    expect(persisted?.codeBlockIndentSize).toBe(4);
  });
});
