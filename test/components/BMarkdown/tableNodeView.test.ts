/* @vitest-environment jsdom */

import type { DecorationSource } from '@tiptap/pm/view';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TableView from '@/components/BMarkdown/components/TableView.vue';

const chainRecorder = {
  focus: vi.fn(),
  addColumnBefore: vi.fn(),
  addColumnAfter: vi.fn(),
  addRowBefore: vi.fn(),
  addRowAfter: vi.fn(),
  deleteColumn: vi.fn(),
  deleteRow: vi.fn(),
  run: vi.fn()
};

chainRecorder.focus.mockReturnValue(chainRecorder);
chainRecorder.addColumnBefore.mockReturnValue(chainRecorder);
chainRecorder.addColumnAfter.mockReturnValue(chainRecorder);
chainRecorder.addRowBefore.mockReturnValue(chainRecorder);
chainRecorder.addRowAfter.mockReturnValue(chainRecorder);
chainRecorder.deleteColumn.mockReturnValue(chainRecorder);
chainRecorder.deleteRow.mockReturnValue(chainRecorder);
chainRecorder.run.mockReturnValue(true);

/**
 * 构造最小 NodeView props。
 * @param editable - 是否可编辑
 * @returns NodeView props
 */
function createNodeViewProps(editable = true) {
  return {
    editor: {
      isEditable: editable,
      chain: () => chainRecorder
    },
    extension: {},
    getPos: () => 0,
    deleteNode: vi.fn(),
    updateAttributes: vi.fn(),
    view: {} as never,
    innerDecorations: {} as DecorationSource,
    HTMLAttributes: {},
    node: {
      attrs: {},
      type: { name: 'table' }
    },
    decorations: [],
    selected: false
  };
}

/**
 * 统计匹配节点中当前可见的数量。
 * @param wrapper - 组件挂载结果
 * @param selector - 查询选择器
 * @returns 可见节点数量
 */
function countVisible(wrapper: ReturnType<typeof mount>, selector: string): number {
  return wrapper.findAll(selector).filter((node) => node.isVisible()).length;
}

/**
 * 获取新增列按钮。
 * @param wrapper - 组件挂载结果
 * @returns 新增列按钮
 */
function getAddColumnButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('button[title="新增列"]');
}

/**
 * 获取新增行按钮。
 * @param wrapper - 组件挂载结果
 * @returns 新增行按钮
 */
function getAddRowButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('button[title="新增行"]');
}

describe('TableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows add controls when hovering a divider', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 0, configurable: true });

    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(countVisible(wrapper, '.b-markdown-table__add-button')).toBe(1);
    expect(wrapper.get('.b-markdown-table__line-highlight--column').isVisible()).toBe(true);
    expect(getAddColumnButton(wrapper).isVisible()).toBe(true);
    expect(wrapper.get('.b-markdown-table__button-icon').isVisible()).toBe(true);
    expect(wrapper.get('.b-markdown-table__line-highlight--column').attributes('style')).toContain('left: 119px');
    expect(getAddColumnButton(wrapper).attributes('title')).toBe('新增列');
    expect(getAddColumnButton(wrapper).attributes('aria-label')).toBe('新增列');
  });

  it('applies directional positioning to the add-button group instead of the inner add button', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 120, clientY: 40 });

    const columnAddButton = getAddColumnButton(wrapper);
    const rowAddButton = getAddRowButton(wrapper);

    expect(columnAddButton.element.parentElement?.className).toContain('b-markdown-table__add-button-group--column');
    expect(rowAddButton.element.parentElement?.className).toContain('b-markdown-table__add-button-group--row');
    expect(columnAddButton.attributes('class')).toBe('b-markdown-table__add-button');
    expect(rowAddButton.attributes('class')).toBe('b-markdown-table__add-button');
  });

  it('shows both add controls when hovering a divider intersection', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 120, clientY: 40 });

    expect(countVisible(wrapper, '.b-markdown-table__add-button')).toBe(2);
    expect(getAddColumnButton(wrapper).isVisible()).toBe(true);
    expect(getAddRowButton(wrapper).isVisible()).toBe(true);
    expect(wrapper.get('.b-markdown-table__line-highlight--column').isVisible()).toBe(true);
    expect(wrapper.get('.b-markdown-table__line-highlight--row').isVisible()).toBe(true);
  });

  it('keeps only the column add control when the pointer leaves the intersection upward', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 320, clientY: 140 });
    expect(countVisible(wrapper, '.b-markdown-table__add-button')).toBe(2);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 320, clientY: 92 }));
    await nextTick();

    expect(getAddColumnButton(wrapper).element.parentElement?.getAttribute('style')).not.toContain('display: none;');
    expect(getAddRowButton(wrapper).element.parentElement?.getAttribute('style')).toContain('display: none;');
  });

  it('keeps only the row add control when the pointer leaves the intersection to the left', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 320, clientY: 140 });
    expect(countVisible(wrapper, '.b-markdown-table__add-button')).toBe(2);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 192, clientY: 140 }));
    await nextTick();

    expect(getAddColumnButton(wrapper).element.parentElement?.getAttribute('style')).toContain('display: none;');
    expect(getAddRowButton(wrapper).element.parentElement?.getAttribute('style')).not.toContain('display: none;');
  });

  it('renders divider overlays outside the scroller to avoid overflow clipping', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-markdown-table__line-overlay').isVisible()).toBe(true);
    expect(scroller.find('.b-markdown-table__line-overlay').exists()).toBe(false);
  });

  it('shows both row and column remove controls when hovering a cell segment away from dividers', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });

    expect(countVisible(wrapper, '.b-markdown-table__segment-button-group')).toBe(2);
    expect(countVisible(wrapper, '.b-markdown-table__remove-button')).toBe(2);
    expect(wrapper.get('.b-markdown-table__remove-button--row').isVisible()).toBe(true);
    expect(wrapper.get('.b-markdown-table__remove-button--column').isVisible()).toBe(true);
    expect(wrapper.get('.b-markdown-table__remove-button--row').element.parentElement?.getAttribute('style')).toContain('left: 0px');
    expect(wrapper.get('.b-markdown-table__remove-button--row').element.parentElement?.getAttribute('style')).toContain('top: 60px');
    expect(wrapper.get('.b-markdown-table__remove-button--column').element.parentElement?.getAttribute('style')).toContain('left: 180px');
    expect(wrapper.get('.b-markdown-table__remove-button--column').element.parentElement?.getAttribute('style')).toContain('top: 0px');
  });

  it('delays switching from segment remove controls to divider add controls', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });
    expect(countVisible(wrapper, '.b-markdown-table__segment-button-group')).toBe(2);

    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-markdown-table__segment-overlay').attributes('style')).not.toContain('display: none;');
    expect(wrapper.get('.b-markdown-table__line-overlay').attributes('style')).toContain('display: none;');
    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(false);

    vi.runAllTimers();
    await nextTick();
    await nextTick();

    expect(wrapper.get('.b-markdown-table__segment-overlay').attributes('style')).toContain('display: none;');
    expect(wrapper.get('.b-markdown-table__line-overlay').attributes('style')).not.toContain('display: none;');
    expect(getAddColumnButton(wrapper).element.parentElement?.getAttribute('style')).not.toContain('display: none;');
  });

  it('still switches from segment remove controls to divider add controls when window mousemove also fires', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 380, clientY: 160 });
    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 321, clientY: 120 }));

    vi.runAllTimers();
    await nextTick();
    await nextTick();

    expect(wrapper.get('.b-markdown-table__segment-overlay').attributes('style')).toContain('display: none;');
    expect(wrapper.get('.b-markdown-table__line-overlay').attributes('style')).not.toContain('display: none;');
    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
  });

  it('uses the row add-button variant when hovering a horizontal divider', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 80, clientY: 119 });

    expect(getAddRowButton(wrapper).isVisible()).toBe(true);
    expect(wrapper.get('.b-markdown-table__line-highlight--row').attributes('style')).toContain('top: 119px');
    expect(getAddRowButton(wrapper).element.parentElement?.getAttribute('style')).toContain('left: 0px');
    expect(getAddRowButton(wrapper).element.parentElement?.getAttribute('style')).toContain('top: 120px');
    expect(getAddRowButton(wrapper).attributes('title')).toBe('新增行');
    expect(getAddRowButton(wrapper).attributes('aria-label')).toBe('新增行');
  });

  it('keeps leading-edge add controls inside the reserved viewport gutter', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 1, clientY: 20 });

    const style = getAddColumnButton(wrapper).element.parentElement?.getAttribute('style') ?? '';
    expect(style).toContain('top: 0px');
    expect(style).toContain('left: 0px');
  });

  it('keeps controls visible when the pointer leaves the scroller toward an overlay button', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    const addButton = wrapper.get('.b-markdown-table__add-button');
    await scroller.trigger('mouseleave', { relatedTarget: addButton.element });

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
  });

  it('does not immediately hide controls when scroller mouseleave fires before the next viewport move', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    await scroller.trigger('mouseleave');

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);

    await viewport.trigger('mousemove', { clientX: 321, clientY: 92 });
    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
  });

  it('does not immediately hide controls when viewport mouseleave fires before button enter', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });
    await viewport.trigger('mouseleave');

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);

    const addButton = wrapper.get('.b-markdown-table__add-button');
    await addButton.trigger('mouseenter');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
  });

  it('keeps controls visible when global mousemove continues toward the button after leaving the viewport', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    await viewport.trigger('mouseleave');
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 321, clientY: 92 }));
    await nextTick();

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
  });

  it('keeps add controls visible after the hide delay while the pointer pauses in the gap before the button', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    const addButton = wrapper.get('.b-markdown-table__add-button');
    vi.spyOn(addButton.element, 'getBoundingClientRect').mockReturnValue({
      x: 312,
      y: 84,
      top: 84,
      left: 312,
      right: 328,
      bottom: 100,
      width: 16,
      height: 16,
      toJSON: () => ({})
    } as DOMRect);

    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    await scroller.trigger('mouseleave');
    await viewport.trigger('mouseleave');

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 340, clientY: 92 }));
    vi.advanceTimersByTime(400);
    await nextTick();

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
  });

  it('keeps add controls visible while the pointer moves toward the add button outside the table', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    await scroller.trigger('mousemove', { clientX: 321, clientY: 120 });
    await viewport.trigger('mousemove', { clientX: 321, clientY: 92 });

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);

    const addButton = wrapper.get('.b-markdown-table__add-button');
    await addButton.trigger('mouseenter');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.find('.b-markdown-table__add-button').exists()).toBe(true);
  });

  it('keeps remove controls visible while the pointer moves toward the remove button outside the table', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    vi.spyOn(viewport.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroller.element, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 560,
      bottom: 340,
      width: 360,
      height: 240,
      toJSON: () => ({})
    } as DOMRect);
    await scroller.trigger('mousemove', { clientX: 380, clientY: 160 });
    await viewport.trigger('mousemove', { clientX: 192, clientY: 160 });

    expect(wrapper.get('.b-markdown-table__remove-button--row').isVisible()).toBe(true);

    const removeButton = wrapper.get('.b-markdown-table__remove-button--row');
    await removeButton.trigger('mouseenter');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-markdown-table__remove-button--row').isVisible()).toBe(true);
  });

  it('hides controls after mouseleave', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });
    await scroller.trigger('mouseleave');
    await viewport.trigger('mouseleave');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(false);
    expect(wrapper.get('.b-markdown-table__remove-button').isVisible()).toBe(false);
  });

  it('keeps the last add-control position styles after the overlay is hidden', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    const visibleAddButtonStyle = getAddColumnButton(wrapper).element.parentElement?.getAttribute('style');
    const visibleLineStyle = wrapper.get('.b-markdown-table__line-highlight--column').attributes('style');

    await scroller.trigger('mouseleave');
    await viewport.trigger('mouseleave');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(false);
    expect(wrapper.get('.b-markdown-table__line-highlight--column').isVisible()).toBe(false);
    expect(getAddColumnButton(wrapper).element.parentElement?.getAttribute('style')).toBe(visibleAddButtonStyle);
    expect(wrapper.get('.b-markdown-table__line-highlight--column').attributes('style')).toBe(visibleLineStyle);
  });

  it('keeps the last remove-control position styles after the overlay is hidden', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    const viewport = wrapper.get('.b-markdown-table__viewport');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });

    const visibleRowStyle = wrapper.get('.b-markdown-table__segment-button-group--row').attributes('style');
    const visibleColumnStyle = wrapper.get('.b-markdown-table__segment-button-group--column').attributes('style');

    await scroller.trigger('mouseleave');
    await viewport.trigger('mouseleave');
    vi.runAllTimers();
    await nextTick();

    expect(wrapper.get('.b-markdown-table__remove-button--row').isVisible()).toBe(false);
    expect(wrapper.get('.b-markdown-table__remove-button--column').isVisible()).toBe(false);
    expect(wrapper.get('.b-markdown-table__segment-button-group--row').attributes('style')).toBe(visibleRowStyle);
    expect(wrapper.get('.b-markdown-table__segment-button-group--column').attributes('style')).toBe(visibleColumnStyle);
  });

  it('does not show controls when the editor is not editable', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps(false)
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(false);
    expect(wrapper.get('.b-markdown-table__remove-button').isVisible()).toBe(false);
  });

  it('recomputes hover state after horizontal scrolling', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-markdown-table__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 120, configurable: true });

    await scroller.trigger('scroll');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.get('.b-markdown-table__add-button').isVisible()).toBe(true);
  });
});
