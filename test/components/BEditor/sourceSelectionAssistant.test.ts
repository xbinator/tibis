/* @vitest-environment jsdom */
/**
 * @file sourceSelectionAssistant.test.ts
 * @description Source 选区适配器事件绑定测试。
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SelectionAssistantContext } from '@/components/BEditor/adapters/selectionAssistant';
import { createSourceSelectionAssistantAdapter } from '@/components/BEditor/adapters/sourceSelectionAssistant';

/**
 * 创建测试用 Source adapter。
 * @returns 测试所需的 view、adapter 与清理函数
 */
function createAdapterHarness(): {
  view: EditorView;
  overlayRoot: HTMLDivElement;
  cleanup: () => void;
} {
  const parent = document.createElement('div');
  const overlayRoot = document.createElement('div');
  document.body.appendChild(parent);
  document.body.appendChild(overlayRoot);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: 'hello world'
    })
  });

  return {
    view,
    overlayRoot,
    cleanup(): void {
      view.destroy();
      parent.remove();
      overlayRoot.remove();
    }
  };
}

describe('sourceSelectionAssistant', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('emits selection changes during pointer drag instead of waiting for mouseup only', () => {
    const { view, overlayRoot, cleanup } = createAdapterHarness();
    const context: SelectionAssistantContext = {
      editorState: {
        id: 'editor-1',
        name: 'demo.md',
        content: 'hello world',
        ext: 'md',
        path: null
      },
      overlayRoot
    };
    const adapter = createSourceSelectionAssistantAdapter(view, context, () => true);
    const onSelectionChange = vi.fn();
    const onPointerSelectionEnd = vi.fn();

    const unbind = adapter.bindSelectionEvents({
      onSelectionChange,
      onFocus: (): void => undefined,
      onBlur: (): void => undefined,
      onPointerSelectionEnd
    });

    view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, buttons: 1 }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, buttons: 0 }));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onPointerSelectionEnd).toHaveBeenCalledTimes(1);

    unbind();
    cleanup();
  });

  test('ignores trailing empty lines when computing toolbar selection bottom', () => {
    const docContent = 'title\n\n';
    const overlayRoot = document.createElement('div');
    const context: SelectionAssistantContext = {
      editorState: {
        id: 'editor-1',
        name: 'demo.md',
        content: docContent,
        ext: 'md',
        path: null
      },
      overlayRoot
    };

    Object.defineProperty(overlayRoot, 'getBoundingClientRect', {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 400, 300)
    });

    const view = {
      state: {
        doc: {
          sliceString: (from: number, to: number) => docContent.slice(from, to),
          lineAt: () => ({ from: 0, to: 5, length: 5 })
        }
      },
      coordsAtPos: vi.fn((pos: number, side?: -1 | 1) => {
        if (pos === 0) {
          return { top: 10, left: 20, right: 20, bottom: 30 };
        }

        if (pos === 5 && side === -1) {
          return { top: 10, left: 100, right: 100, bottom: 30 };
        }

        if (pos === 6 && side === -1) {
          return { top: 40, left: 20, right: 20, bottom: 60 };
        }

        return { top: 10, left: 20, right: 20, bottom: 30 };
      }),
      lineBlockAt: vi.fn(() => ({
        top: 10,
        bottom: 30
      }))
    } as unknown as EditorView;

    const adapter = createSourceSelectionAssistantAdapter(view, context, () => true);
    const position = adapter.getToolbarPosition({
      from: 0,
      to: 7,
      text: 'title\n\n'
    });

    expect(position?.selectionRect).toEqual({
      top: 10,
      left: 20,
      width: 80,
      height: 20
    });
    expect(view.coordsAtPos).toHaveBeenCalledWith(5, -1);
    expect(view.coordsAtPos).not.toHaveBeenCalledWith(6, -1);
  });
});
