/**
 * @file drawing-geometry.test.ts
 * @description 验证 BDrawing 共享几何工具的坐标、路径和 DOM 查询逻辑。
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { DRAWING_ELEMENT_ID_ATTRIBUTE } from '@/components/BDrawing/constants/dom';
import type { DrawingElement, DrawingShapeElement, DrawingViewport } from '@/components/BDrawing/types';
import {
  clientDeltaToDrawingDelta,
  createDrawingElementCssTransform,
  createDrawingViewportForElements,
  findDrawingShapeElement,
  getDrawingResponsiveViewBoxSize,
  getDrawingShapeRenderSize,
  projectClientPointToDrawingBoard,
  queryDrawingElementTarget
} from '@/components/BDrawing/utils/drawingGeometry';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @param position - 元素位置
 * @returns 测试形状元素
 */
function createShapeElement(id: string, position = { x: 40, y: 60 }): DrawingShapeElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '矩形',
    position,
    size: { width: 120, height: 80 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建测试文本元素。
 * @param id - 元素 ID
 * @param content - 文本正文
 * @param position - 元素位置
 * @param style - 文本样式
 * @returns 测试文本元素
 */
function createTextElement(
  id: string,
  content = '标题',
  position = { x: 400, y: 260 },
  style: DrawingShapeElement['style'] = { fontSize: 20 }
): DrawingShapeElement {
  return {
    id,
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '文本',
    position,
    size: { width: 180, height: 72 },
    rotation: 0,
    style,
    metadata: {
      content
    }
  };
}

describe('drawingGeometry', (): void => {
  it('projects client coordinates into board coordinates', (): void => {
    const viewport: DrawingViewport = {
      center: { x: 100, y: 80 },
      zoom: 2
    };
    const projection = projectClientPointToDrawingBoard(
      { x: 50, y: 25 },
      {
        left: 0,
        top: 0,
        width: 100,
        height: 50
      },
      viewport
    );

    expect(projection?.viewportRatio).toEqual({ x: 0.5, y: 0.5 });
    expect(projection?.boardPoint).toEqual({ x: 100, y: 80 });
  });

  it('uses the rendered viewport size as the viewBox baseline', (): void => {
    const viewport: DrawingViewport = {
      center: { x: 0, y: 0 },
      zoom: 1
    };
    const projection = projectClientPointToDrawingBoard(
      { x: 800, y: 600 },
      {
        left: 0,
        top: 0,
        width: 800,
        height: 600
      },
      viewport
    );

    expect(getDrawingResponsiveViewBoxSize(1, { width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(projection?.boardPoint).toEqual({ x: 400, y: 300 });
  });

  it('returns null when browser geometry is unavailable', (): void => {
    const viewport: DrawingViewport = {
      center: { x: 0, y: 0 },
      zoom: 1
    };

    expect(projectClientPointToDrawingBoard({ x: 10, y: 20 }, { left: 0, top: 0, width: 0, height: 0 }, viewport)).toBeNull();
    expect(clientDeltaToDrawingDelta({ x: 10, y: 20 }, { width: 0, height: 0 }, 1)).toBeNull();
  });

  it('converts browser deltas into board deltas with the current zoom', (): void => {
    expect(clientDeltaToDrawingDelta({ x: 80, y: 40 }, { width: 800, height: 400 }, 2)).toEqual({ x: 40, y: 20 });
  });

  it('creates a viewport that contains existing drawing content', (): void => {
    const viewport = createDrawingViewportForElements([createShapeElement('node-1'), createShapeElement('node-2', { x: 400, y: 260 })], {
      width: 800,
      height: 600
    });

    expect(viewport).toEqual({
      center: { x: 280, y: 200 },
      zoom: 1
    });
  });

  it('uses schema model size for text element render bounds', (): void => {
    expect(getDrawingShapeRenderSize(createShapeElement('node-1'))).toEqual({ width: 120, height: 80 });
    expect(getDrawingShapeRenderSize(createTextElement('text-1'))).toEqual({ width: 180, height: 72 });
  });

  it('keeps text model height independent from content padding render bounds', (): void => {
    const element = createTextElement(
      'text-1',
      '标题',
      { x: 400, y: 260 },
      {
        fontSize: 20,
        padding: { top: 4, right: 5, bottom: 6, left: 7 }
      }
    );

    expect(getDrawingShapeRenderSize(element)).toEqual({ width: 180, height: 72 });
  });

  it('keeps text element render size from the stored model size', (): void => {
    const wideElement = createTextElement('text-1', 'abcdef', { x: 400, y: 260 }, { fontSize: 10 });
    const narrowElement = {
      ...wideElement,
      size: { width: 30, height: 72 }
    };

    expect(getDrawingShapeRenderSize(wideElement)).toEqual({ width: 180, height: 72 });
    expect(getDrawingShapeRenderSize(narrowElement)).toEqual({ width: 30, height: 72 });
  });

  it('raises text render height to the wrapped content height when model height is too small', (): void => {
    const element = {
      ...createTextElement('text-1', 'abcdef', { x: 400, y: 260 }, { fontSize: 10 }),
      size: { width: 30, height: 12 }
    };

    expect(getDrawingShapeRenderSize(element)).toEqual({ width: 30, height: 31 });
  });

  it('creates a viewport from schema render sizes', (): void => {
    const viewport = createDrawingViewportForElements([createShapeElement('node-1'), createTextElement('text-1')], {
      width: 800,
      height: 600
    });

    expect(viewport).toEqual({
      center: { x: 310, y: 196 },
      zoom: 1
    });
  });

  it('queries DOM targets by drawing element id', (): void => {
    const root = document.createElement('div');
    const node = document.createElement('div');
    node.setAttribute(DRAWING_ELEMENT_ID_ATTRIBUTE, 'node-1');
    root.appendChild(node);

    expect(queryDrawingElementTarget(root, 'node-1')).toBe(node);
    expect(queryDrawingElementTarget(root, 'missing-node')).toBeNull();
  });

  it('finds shape elements by id', (): void => {
    const elements: DrawingElement[] = [createShapeElement('node-1')];

    expect(findDrawingShapeElement(elements, 'node-1')?.name).toBe('rect');
    expect(findDrawingShapeElement(elements, 'missing-node')).toBeNull();
  });

  it('creates reusable transform strings', (): void => {
    expect(createDrawingElementCssTransform({ x: 10, y: 20 }, 0)).toBe('translate(10px, 20px)');
    expect(createDrawingElementCssTransform({ x: 10, y: 20 }, 90)).toBe('translate(10px, 20px) rotate(90deg)');
  });
});
