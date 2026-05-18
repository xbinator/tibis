/* @vitest-environment jsdom */
/**
 * @file richSelectionAssistant.test.ts
 * @description Rich 选区适配器定位回归测试。
 */

import type { Editor } from '@tiptap/vue-3';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRichSelectionAssistantAdapter } from '@/components/BEditor/adapters/richSelectionAssistant';
import type { SelectionAssistantContext } from '@/components/BEditor/adapters/selectionAssistant';

describe('richSelectionAssistant', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('ignores trailing empty lines when computing toolbar and panel position', () => {
    const overlayRoot = document.createElement('div');
    const context: SelectionAssistantContext = {
      editorState: {
        id: 'editor-1',
        name: 'demo.md',
        content: 'title\n\n',
        ext: 'md',
        path: null
      },
      overlayRoot
    };

    Object.defineProperty(overlayRoot, 'getBoundingClientRect', {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 400, 300)
    });

    const editor = {
      isEditable: true,
      state: {
        selection: {
          from: 1,
          to: 7
        },
        doc: {
          nodeSize: 7,
          textBetween: (from: number, to: number) => 'title\n\n'.slice(from, to)
        }
      },
      view: {
        dom: {
          querySelectorAll: () => [
            {
              getBoundingClientRect: () => new DOMRect(20, 10, 80, 20)
            },
            {
              getBoundingClientRect: () => new DOMRect(20, 40, 0, 20)
            }
          ]
        },
        coordsAtPos: vi.fn((pos: number, side?: -1 | 1) => {
          if (pos === 1) {
            return { top: 10, left: 20, right: 20, bottom: 30 };
          }
          if (pos === 5 && side === -1) {
            return { top: 10, left: 100, right: 100, bottom: 30 };
          }
          if (pos === 7 && side === -1) {
            return { top: 40, left: 20, right: 20, bottom: 60 };
          }
          return { top: 10, left: 20, right: 20, bottom: 30 };
        })
      }
    } as unknown as Editor;

    const adapter = createRichSelectionAssistantAdapter(editor, context);
    const range = {
      from: 1,
      to: 7,
      text: 'itle\n\n'
    };

    const toolbarPosition = adapter.getToolbarPosition(range);
    const panelPosition = adapter.getPanelPosition(range);

    expect(toolbarPosition?.selectionRect).toEqual({
      top: 10,
      left: 20,
      width: 80,
      height: 20
    });
    expect(panelPosition?.anchorRect).toEqual({
      top: 10,
      left: 100,
      width: 0,
      height: 20
    });
    expect(editor.view.coordsAtPos).toHaveBeenCalledWith(5, -1);
    expect(editor.view.coordsAtPos).not.toHaveBeenCalledWith(7, -1);
  });
});
