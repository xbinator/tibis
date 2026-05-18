/* @vitest-environment jsdom */
/**
 * @file useSelectionAssistant.test.ts
 * @description useSelectionAssistant 在 source 模式下的新选区起始行为测试。
 */

import type { SelectionAssistantAdapter, SelectionAssistantCapabilities, SelectionAssistantPosition, SelectionAssistantRange } from '@/components/BEditor/adapters/selectionAssistant';
import { defineComponent, nextTick, watchEffect } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useSelectionAssistant, type SelectionAssistantStatus } from '@/components/BEditor/hooks/useSelectionAssistant';

/**
 * 选区事件处理器集合。
 */
interface BoundHandlers {
  onSelectionChange: () => void;
  onFocus: () => void;
  onBlur: (event?: FocusEvent) => void;
  onPointerDownInsideEditor?: (event: PointerEvent) => void;
  onPointerSelectionStart?: (event: PointerEvent) => void;
  onPointerSelectionEnd?: (event: PointerEvent) => void;
  onPointerDownOutsideEditor?: (event: PointerEvent) => void;
  onEscape?: () => void;
}

let currentSelection: SelectionAssistantRange | null = null;
let boundHandlers: BoundHandlers | null = null;

const clearSelectionHighlight = vi.fn();
const showSelectionHighlight = vi.fn();

/**
 * 测试用 adapter。
 */
const adapter: SelectionAssistantAdapter = {
  getCapabilities(): SelectionAssistantCapabilities {
    return {
      actions: {
        ai: true,
        reference: true
      }
    };
  },
  isEditable(): boolean {
    return true;
  },
  getSelection(): SelectionAssistantRange | null {
    return currentSelection ? { ...currentSelection } : null;
  },
  restoreSelection(): void {},
  getPanelPosition(): SelectionAssistantPosition | null {
    return null;
  },
  getToolbarPosition(): SelectionAssistantPosition | null {
    return null;
  },
  showSelectionHighlight(range: SelectionAssistantRange): void {
    showSelectionHighlight(range);
  },
  clearSelectionHighlight(): void {
    clearSelectionHighlight();
  },
  async applyGeneratedContent(): Promise<void> {},
  buildSelectionReference() {
    return null;
  },
  bindSelectionEvents(handlers): () => void {
    boundHandlers = handlers;
    return (): void => {
      boundHandlers = null;
    };
  }
};

let latestStatus: SelectionAssistantStatus = 'idle';
let latestToolbarVisible = false;
let recomputeAllPositionsRef: (() => void) | null = null;

/**
 * 挂载 useSelectionAssistant 的测试组件。
 */
const HookHarness = defineComponent({
  name: 'SelectionAssistantHarness',
  setup() {
    const assistant = useSelectionAssistant({
      adapter: () => adapter,
      isEditable: () => true
    });

    watchEffect((): void => {
      latestStatus = assistant.status.value;
      latestToolbarVisible = assistant.toolbarVisible.value;
    });

    recomputeAllPositionsRef = assistant.recomputeAllPositions;

    return () => null;
  }
});

describe('useSelectionAssistant', () => {
  afterEach(() => {
    currentSelection = null;
    boundHandlers = null;
    latestStatus = 'idle';
    latestToolbarVisible = false;
    recomputeAllPositionsRef = null;
    clearSelectionHighlight.mockReset();
    showSelectionHighlight.mockReset();
  });

  test('clears the previous source highlight as soon as a new pointer selection starts', async () => {
    mount(HookHarness);
    await nextTick();
    clearSelectionHighlight.mockClear();
    showSelectionHighlight.mockClear();

    currentSelection = {
      from: 0,
      to: 5,
      text: 'hello'
    };
    boundHandlers?.onSelectionChange();
    await nextTick();

    expect(latestStatus).toBe('toolbar-visible');
    expect(showSelectionHighlight).toHaveBeenCalledTimes(1);

    boundHandlers?.onPointerDownInsideEditor?.(new PointerEvent('pointerdown'));
    await nextTick();

    expect(clearSelectionHighlight).toHaveBeenCalledTimes(1);
    expect(latestStatus).toBe('idle');
  });

  test('keeps toolbar hidden while pointer selection is still in progress and shows it after pointerup', async () => {
    mount(HookHarness);
    await nextTick();
    clearSelectionHighlight.mockClear();
    showSelectionHighlight.mockClear();

    boundHandlers?.onPointerSelectionStart?.(new PointerEvent('pointerdown'));
    currentSelection = {
      from: 1,
      to: 6,
      text: 'ello '
    };
    boundHandlers?.onSelectionChange();
    await nextTick();

    expect(latestStatus).toBe('idle');
    expect(latestToolbarVisible).toBe(false);
    expect(showSelectionHighlight).toHaveBeenCalledTimes(1);

    boundHandlers?.onPointerSelectionEnd?.(new PointerEvent('pointerup'));
    await nextTick();

    expect(latestStatus).toBe('toolbar-visible');
    expect(latestToolbarVisible).toBe(true);
    expect(showSelectionHighlight).toHaveBeenCalledTimes(2);
  });

  test('keeps toolbar hidden on pointerdown even if selection updates immediately', async () => {
    mount(HookHarness);
    await nextTick();
    clearSelectionHighlight.mockClear();
    showSelectionHighlight.mockClear();

    boundHandlers?.onPointerSelectionStart?.(new PointerEvent('pointerdown'));
    currentSelection = {
      from: 2,
      to: 7,
      text: 'llo w'
    };
    boundHandlers?.onSelectionChange();
    await nextTick();

    expect(latestToolbarVisible).toBe(false);
    expect(showSelectionHighlight).toHaveBeenCalledTimes(1);
  });

  test('skips overlay recompute when the cached range is no longer valid', async () => {
    const getToolbarPosition = vi.fn((): SelectionAssistantPosition | null => ({
      anchorRect: { top: 0, left: 0, width: 0, height: 0 },
      lineHeight: 20
    }));
    const getPanelPosition = vi.fn((): SelectionAssistantPosition | null => ({
      anchorRect: { top: 0, left: 0, width: 0, height: 0 },
      lineHeight: 20
    }));
    const invalidatingAdapter: SelectionAssistantAdapter = {
      ...adapter,
      getToolbarPosition,
      getPanelPosition,
      isRangeStillValid: () => false
    };
    const InvalidRangeHarness = defineComponent({
      name: 'InvalidRangeHarness',
      setup() {
        const assistant = useSelectionAssistant({
          adapter: () => invalidatingAdapter,
          isEditable: () => true
        });

        recomputeAllPositionsRef = assistant.recomputeAllPositions;
        return () => null;
      }
    });

    mount(InvalidRangeHarness);
    await nextTick();

    currentSelection = {
      from: 1,
      to: 6,
      text: 'hello'
    };
    boundHandlers?.onSelectionChange();
    await nextTick();

    getToolbarPosition.mockClear();
    getPanelPosition.mockClear();
    recomputeAllPositionsRef?.();

    expect(getToolbarPosition).not.toHaveBeenCalled();
    expect(getPanelPosition).not.toHaveBeenCalled();
  });
});
