/**
 * @file theme.test.ts
 * @description Monaco 主题注册刷新测试。
 */
import { readFileSync } from 'node:fs';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.main.js';
import { describe, expect, it, vi } from 'vitest';
import { ensureTheme } from '@/components/BMonaco/utils/createMonaco';

/**
 * 创建 Monaco API 测试桩。
 * @returns Monaco API 测试桩
 */
function createMonacoMock(): typeof Monaco {
  return {
    editor: {
      defineTheme: vi.fn()
    }
  } as unknown as typeof Monaco;
}

describe('BMonaco theme registration', (): void => {
  it('redefines an existing theme name so refreshed tokens take effect', (): void => {
    const monaco = createMonacoMock();

    ensureTheme(monaco, 'one-dark', 'light');
    ensureTheme(monaco, 'one-dark', 'light');

    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(2);
  });

  it('overrides native Monaco selection colors with app theme variables', (): void => {
    const source = readFileSync(new URL('../../../src/components/BMonaco/index.vue', import.meta.url), 'utf8');

    expect(source).toContain('.b-editor-monaco .monaco-editor .focused .selected-text');
    expect(source).toContain('background: var(--monaco-selection-bg) !important;');
    expect(source).toContain('.b-editor-monaco .monaco-editor .selected-text');
    expect(source).toContain('background: var(--monaco-inactive-selection-bg) !important;');
  });

  it('disables Monaco occurrence highlights derived from the current selection', (): void => {
    const source = readFileSync(new URL('../../../src/components/BMonaco/utils/createMonaco.ts', import.meta.url), 'utf8');

    expect(source).toContain('selectionHighlight: false');
  });

  it('renders Monaco overflow widgets as fixed so modal containers do not clip suggestions', (): void => {
    const source = readFileSync(new URL('../../../src/components/BMonaco/utils/createMonaco.ts', import.meta.url), 'utf8');

    expect(source).toContain('fixedOverflowWidgets: true');
  });

  it('prevents Ctrl or Cmd S from triggering the browser save dialog while Monaco is focused', (): void => {
    const source = readFileSync(new URL('../../../src/components/BMonaco/utils/createMonaco.ts', import.meta.url), 'utf8');

    expect(source).toContain('monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS');
  });
});
