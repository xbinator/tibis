/* @vitest-environment jsdom */

/**
 * @file tableNodeView.integration.test.ts
 * @description 验证表格 NodeView 在真实富文本编辑器中的增删集成行为。
 */

import type { ComponentPublicInstance } from 'vue';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PaneRichEditor from '@/components/BEditor/panes/PaneRichEditor.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

vi.mock('@/components/BEditor/hooks/useSelectionAssistant', () => ({
  useSelectionAssistant: () => ({
    toolbarVisible: ref(false),
    toolbarPosition: ref(null),
    aiInputVisible: ref(false),
    cachedSelectionRange: ref(null),
    panelPosition: ref(null),
    openAIInput: vi.fn(),
    closeAIInput: vi.fn(),
    applyAIResult: vi.fn(async () => undefined),
    setStreaming: vi.fn(),
    insertReference: vi.fn(),
    recomputeAllPositions: vi.fn()
  })
}));

/**
 * 富文本面板公开的最小实例接口。
 */
interface PaneRichEditorVm extends ComponentPublicInstance {
  /** 聚焦编辑器。 */
  focusEditor: () => void;
  /** 聚焦编辑器起始位置。 */
  focusEditorAtStart: () => void;
}

/**
 * 等待编辑器挂载与异步副作用稳定。
 */
async function flushEditorWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 挂载富文本编辑器面板。
 * @param value - 初始 Markdown 内容
 * @returns 挂载后的组件包装器
 */
function mountPaneRichEditor(value: string): VueWrapper<PaneRichEditorVm> {
  return mount(PaneRichEditor, {
    attachTo: document.body,
    props: {
      value,
      outlineContent: '',
      editable: true,
      editorState: {
        id: 'table-nodeview-integration',
        name: 'table-nodeview-integration.md',
        content: value,
        ext: 'md',
        path: null
      }
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        CurrentBlockMenu: true,
        FrontMatterCard: true,
        SelectionAIInput: true,
        SelectionToolbarRich: true
      }
    }
  }) as VueWrapper<PaneRichEditorVm>;
}

/**
 * 为当前渲染出的表格补充稳定的几何信息。
 * @param wrapper - 富文本编辑器包装器
 */
function applyTableGeometry(wrapper: VueWrapper<PaneRichEditorVm>): void {
  /**
   * 为元素补充几何读取方法。
   * @param element - 目标元素
   * @param rect - 目标矩形
   */
  function defineElementRect(element: Element, rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect
    });
    Object.defineProperty(element, 'getClientRects', {
      configurable: true,
      value: () => [rect]
    });
  }

  const table = wrapper.get('table').element as HTMLTableElement;
  const scroller = wrapper.get('.b-markdown-table__scroller').element as HTMLElement;
  const rows = Array.from(table.querySelectorAll('tr'));

  defineElementRect(scroller, {
    left: 200,
    top: 100,
    right: 440,
    bottom: 220,
    width: 240,
    height: 120
  });

  defineElementRect(table, {
    left: 200,
    top: 100,
    right: 440,
    bottom: 100 + rows.length * 40,
    width: 240,
    height: rows.length * 40
  });

  rows.forEach((row, rowIndex) => {
    defineElementRect(row, {
      left: 200,
      top: 100 + rowIndex * 40,
      right: 440,
      bottom: 100 + (rowIndex + 1) * 40,
      width: 240,
      height: 40
    });

    Array.from(row.querySelectorAll('th,td')).forEach((cell, columnIndex) => {
      const rect = {
        left: 200 + columnIndex * 120,
        top: 100 + rowIndex * 40,
        right: 200 + (columnIndex + 1) * 120,
        bottom: 100 + (rowIndex + 1) * 40,
        width: 120,
        height: 40
      };

      defineElementRect(cell, rect);

      Array.from(cell.querySelectorAll('p')).forEach((paragraph) => {
        defineElementRect(paragraph, rect);
      });
    });
  });
}

/**
 * 为 jsdom 补齐 ProseMirror 读取选区几何时依赖的节点矩形方法。
 */
function installTextGeometryFallback(): void {
  if (typeof Node === 'undefined') {
    return;
  }

  if (typeof Node.prototype.getClientRects !== 'function') {
    Object.defineProperty(Node.prototype, 'getClientRects', {
      configurable: true,
      value: (): DOMRect[] => [new DOMRect(0, 0, 0, 0)]
    });
  }

  if (typeof Node.prototype.getBoundingClientRect !== 'function') {
    Object.defineProperty(Node.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 0, 0)
    });
  }

  if (typeof document.elementFromPoint !== 'function') {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (): Element | null => document.body
    });
  }
}

describe('table node view integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installTextGeometryFallback();
  });

  test('adds a column through the visible add button in a real rich editor table', async () => {
    const wrapper = mountPaneRichEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    await flushEditorWork();
    applyTableGeometry(wrapper);

    wrapper.vm.focusEditor();
    await flushEditorWork();

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    expect(wrapper.get('.b-markdown-table__add-button').element.parentElement?.getAttribute('style')).toContain('left: 120px');
    await wrapper.get('.b-markdown-table__add-button').trigger('click');
    await flushEditorWork();

    const rows = wrapper.findAll('table tr');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row.findAll('th,td')).toHaveLength(3);
    });

    wrapper.unmount();
  });

  test('adds a column even when the current selection has moved outside the table', async () => {
    const wrapper = mountPaneRichEditor('Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    try {
      await flushEditorWork();
      applyTableGeometry(wrapper);

      wrapper.vm.focusEditorAtStart();
      await flushEditorWork();

      const scroller = wrapper.get('.b-markdown-table__scroller');
      await scroller.trigger('mousemove', { clientX: 321, clientY: 160 });
      expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);

      await wrapper.get('.b-markdown-table__add-button').trigger('click');
      await flushEditorWork();

      const rows = wrapper.findAll('table tr');
      expect(rows).toHaveLength(3);
      rows.forEach((row) => {
        expect(row.findAll('th,td')).toHaveLength(3);
      });
    } finally {
      wrapper.unmount();
    }
  });

  test('deletes a body row through the visible remove button in a real rich editor table', async () => {
    const wrapper = mountPaneRichEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    await flushEditorWork();
    applyTableGeometry(wrapper);

    wrapper.vm.focusEditor();
    await flushEditorWork();

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 260, clientY: 160 });
    expect(wrapper.find('.b-markdown-table__remove-button--row').exists()).toBe(true);
    expect(wrapper.find('.b-markdown-table__remove-button--column').exists()).toBe(true);
    await wrapper.get('.b-markdown-table__remove-button--row').trigger('click');
    await flushEditorWork();

    const rows = wrapper.findAll('table tr');
    expect(rows).toHaveLength(2);

    wrapper.unmount();
  });

  test('keeps the add button available briefly after leaving the table viewport', async () => {
    const wrapper = mountPaneRichEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    try {
      await flushEditorWork();
      applyTableGeometry(wrapper);

      const scroller = wrapper.get('.b-markdown-table__scroller');
      await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });

      const addButton = wrapper.get('.b-markdown-table__add-button');
      expect(addButton.isVisible()).toBe(true);

      await wrapper.get('.b-markdown-table__viewport').trigger('mouseleave', { relatedTarget: null });
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 120);
      });

      expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  test('keeps the add button visible while moving from the divider toward the outer button gap', async () => {
    const wrapper = mountPaneRichEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    try {
      await flushEditorWork();
      applyTableGeometry(wrapper);

      const scroller = wrapper.get('.b-markdown-table__scroller');
      await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
      expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);

      await scroller.trigger('mousemove', { clientX: 321, clientY: 94 });
      expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  test('creates a rectangular cell selection while dragging across table cells', async () => {
    const wrapper = mountPaneRichEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    try {
      await flushEditorWork();
      applyTableGeometry(wrapper);

      const scroller = wrapper.get('.b-markdown-table__scroller');
      const firstHeaderCell = wrapper.findAll('th')[0];
      expect(firstHeaderCell).toBeDefined();

      await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
      expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);

      await firstHeaderCell!.trigger('mousedown', { clientX: 260, clientY: 120, button: 0 });
      await scroller.trigger('mousemove', { clientX: 380, clientY: 160, buttons: 1 });
      await flushEditorWork();

      expect(wrapper.find('.b-markdown-table__add-button').exists()).toBe(true);
      expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(false);
      expect(wrapper.findAll('th.selectedCell, td.selectedCell')).toHaveLength(4);

      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 380, clientY: 160, button: 0 }));
      await flushEditorWork();
    } finally {
      wrapper.unmount();
    }
  });

  test('does not turn a plain click into a cell selection before dragging starts', async () => {
    const wrapper = mountPaneRichEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    try {
      await flushEditorWork();
      applyTableGeometry(wrapper);

      const firstHeaderCell = wrapper.findAll('th')[0];
      expect(firstHeaderCell).toBeDefined();

      await firstHeaderCell!.trigger('mousedown', { clientX: 260, clientY: 120, button: 0 });
      await flushEditorWork();

      expect(wrapper.findAll('th.selectedCell, td.selectedCell')).toHaveLength(0);

      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 260, clientY: 120, button: 0 }));
      await flushEditorWork();
    } finally {
      wrapper.unmount();
    }
  });

  test('does not start cell selection while dragging stays within the same cell', async () => {
    const wrapper = mountPaneRichEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');

    try {
      await flushEditorWork();
      applyTableGeometry(wrapper);

      const firstHeaderCell = wrapper.findAll('th')[0];
      expect(firstHeaderCell).toBeDefined();

      await firstHeaderCell!.trigger('mousedown', { clientX: 260, clientY: 120, button: 0 });
      await firstHeaderCell!.trigger('mousemove', { clientX: 300, clientY: 120, buttons: 1 });
      await flushEditorWork();

      expect(wrapper.findAll('th.selectedCell, td.selectedCell')).toHaveLength(0);

      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 300, clientY: 120, button: 0 }));
      await flushEditorWork();
    } finally {
      wrapper.unmount();
    }
  });
});
