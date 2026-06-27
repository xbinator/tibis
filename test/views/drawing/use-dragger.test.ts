/**
 * @file use-dragger.test.ts
 * @description 验证通用自定义拖拽创建交互。
 * @vitest-environment jsdom
 */
import { defineComponent, ref } from 'vue';
import type { ComponentPublicInstance, Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useDragger, type DraggerItem, type DraggerPoint } from '@/views/drawing/hooks/useDragger';

/**
 * 拖拽测试落点记录。
 */
interface DragDropRecord {
  /** 元素 schema */
  schema: DraggerItem;
  /** 浏览器坐标 */
  point: DraggerPoint;
}

/**
 * 测试宿主公开实例。
 */
interface DragHostExpose {
  /** 画布元素引用 */
  canvasRef: HTMLElement | null;
  /** 拖拽控制器 */
  drag: ReturnType<typeof useDragger>;
  /** 落点记录 */
  drops: DragDropRecord[];
}

/**
 * 测试宿主 setup 返回状态。
 */
interface DragHostSetupState {
  /** 画布元素引用 */
  canvasRef: Ref<HTMLElement | null>;
  /** 拖拽控制器 */
  drag: ReturnType<typeof useDragger>;
  /** 落点记录 */
  drops: DragDropRecord[];
}

/** 测试元素 schema。 */
const layoutSchema: DraggerItem = {
  name: 'layout',
  label: '布局容器'
};

/**
 * 设置元素测试尺寸。
 * @param element - DOM 元素
 * @param rect - 目标尺寸
 */
function setElementRect(element: Element, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect =>
      DOMRect.fromRect({
        height: rect.height,
        width: rect.width,
        x: rect.left,
        y: rect.top
      })
  });
}

/**
 * 设置拖拽预览测试尺寸。
 * @param size - 预览尺寸
 * @returns 恢复尺寸 mock 的函数
 */
function mockDraggerPreviewSize(size: { width: number; height: number }): () => void {
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(): number {
      return this instanceof HTMLElement && this.classList.contains('dragger-preview') ? size.width : 0;
    }
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(): number {
      return this instanceof HTMLElement && this.classList.contains('dragger-preview') ? size.height : 0;
    }
  });

  return (): void => {
    if (widthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', widthDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth');
    }
    if (heightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heightDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
    }
  };
}

/**
 * 创建带浏览器坐标的指针事件。
 * @param type - 事件类型
 * @param point - 浏览器坐标
 * @returns 指针事件
 */
function createPointerEvent(type: string, point: DraggerPoint): PointerEvent {
  return new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: point.x,
    clientY: point.y
  }) as PointerEvent;
}

/**
 * 创建拖拽 hook 测试宿主。
 * @returns 测试包装器
 */
function mountDragHost(): VueWrapper<ComponentPublicInstance & DragHostExpose> {
  const Host = defineComponent({
    name: 'DraggerHost',
    setup(): DragHostSetupState {
      const canvasRef = ref<HTMLElement | null>(null);
      const drops: DragDropRecord[] = [];
      const drag = useDragger({
        dropTargetRef: canvasRef,
        onDrop: (schema: DraggerItem, point: DraggerPoint): void => {
          drops.push({ schema, point });
        }
      });

      return {
        canvasRef,
        drag,
        drops
      };
    },
    template: '<div><section ref="canvasRef" data-testid="canvas"></section></div>'
  });

  return mount(Host, { attachTo: document.body }) as VueWrapper<ComponentPublicInstance & DragHostExpose>;
}

describe('useDragger', (): void => {
  afterEach((): void => {
    document.body.classList.remove('is-dragger-dragging');
    document.querySelectorAll('.dragger-preview').forEach((element: Element): void => element.remove());
  });

  it('shows a themed text-only preview and drops schema inside the canvas', (): void => {
    const wrapper = mountDragHost();
    const canvas = wrapper.find('[data-testid="canvas"]').element;
    setElementRect(canvas, { height: 260, left: 100, top: 80, width: 360 });

    wrapper.vm.drag.startDrag(layoutSchema);

    const preview = document.querySelector<HTMLElement>('.dragger-preview');
    expect(preview?.textContent).toBe('布局容器');
    expect(preview?.querySelector('svg')).toBeNull();
    expect(preview?.style.border).toBe('');
    expect(preview?.style.fontSize).toBe('12px');
    expect(preview?.style.height).toBe('20px');
    expect(preview?.style.lineHeight).toBe('20px');
    expect(preview?.style.background).toContain('var(--bg-tertiary)');
    expect(preview?.style.boxShadow).toBe('0 0 16px rgb(15 23 42 / 14%)');
    expect(document.body.classList.contains('is-dragger-dragging')).toBe(true);

    window.dispatchEvent(createPointerEvent('pointermove', { x: 160, y: 140 }));
    window.dispatchEvent(createPointerEvent('pointerup', { x: 180, y: 150 }));

    expect(wrapper.vm.drops).toEqual([
      {
        schema: layoutSchema,
        point: { x: 180, y: 150 }
      }
    ]);
    expect(document.querySelector('.dragger-preview')).toBeNull();
    expect(document.body.classList.contains('is-dragger-dragging')).toBe(false);
    wrapper.unmount();
  });

  it('keeps the pointer relative position when dragging from the source right side', (): void => {
    const restorePreviewSize = mockDraggerPreviewSize({ height: 20, width: 100 });
    const wrapper = mountDragHost();
    const sourceElement = document.createElement('button');
    sourceElement.type = 'button';
    sourceElement.addEventListener('pointerdown', (event: PointerEvent): void => {
      wrapper.vm.drag.startDrag(layoutSchema, event);
    });
    setElementRect(sourceElement, { height: 32, left: 100, top: 50, width: 200 });
    document.body.appendChild(sourceElement);

    sourceElement.dispatchEvent(createPointerEvent('pointerdown', { x: 280, y: 66 }));
    window.dispatchEvent(createPointerEvent('pointermove', { x: 300, y: 80 }));

    const preview = document.querySelector<HTMLElement>('.dragger-preview');
    expect(preview?.style.transform).toBe('translate3d(210px, 70px, 0)');

    window.dispatchEvent(createPointerEvent('pointercancel', { x: 300, y: 80 }));
    sourceElement.remove();
    restorePreviewSize();
    wrapper.unmount();
  });
});
