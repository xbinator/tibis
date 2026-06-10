/**
 * @file drawing-geometry.test.ts
 * @description 验证 BDrawing 共享几何工具的坐标、路径和 DOM 查询逻辑。
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import type { DrawingElement, DrawingShapeElement, DrawingViewport } from '@/components/BDrawing/types';
import {
  createDrawingDiamondPoints,
  createDrawingElementTransform,
  createDrawingLinePath,
  createDrawingViewBox,
  findDrawingElementCenter,
  findDrawingShapeElement,
  getDrawingElementId,
  getDrawingLineLabelPosition,
  isDrawingDiamondShape,
  projectClientPointToDrawingBoard,
  queryDrawingElementTarget
} from '@/components/BDrawing/utils/drawingGeometry';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @returns 测试形状元素
 */
function createShapeElement(id: string): DrawingShapeElement {
  return {
    id,
    kind: 'shape',
    shape: 'rect',
    text: '矩形',
    position: { x: 40, y: 60 },
    size: { width: 120, height: 80 },
    rotation: 0,
    metadata: { source: 'user', createdAt: 1 }
  };
}

describe('drawingGeometry', (): void => {
  it('creates viewBox and projects client coordinates into board coordinates', (): void => {
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

    expect(createDrawingViewBox(viewport)).toBe('-200 -100 600 360');
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

    expect(createDrawingViewBox(viewport, { width: 800, height: 600 })).toBe('-400 -300 800 600');
    expect(projection?.boardPoint).toEqual({ x: 400, y: 300 });
  });

  it('creates reusable SVG shape geometry strings', (): void => {
    expect(createDrawingElementTransform({ x: 10, y: 20 }, { width: 40, height: 30 }, 0)).toBe('translate(10, 20)');
    expect(createDrawingElementTransform({ x: 10, y: 20 }, { width: 40, height: 30 }, 90)).toBe('translate(10, 20) rotate(90, 20, 15)');
    expect(createDrawingDiamondPoints({ width: 40, height: 20 })).toBe('20,0 40,10 20,20 0,10');
    expect(createDrawingDiamondPoints({ width: 40, height: 20 }, { x: 5, y: 10 })).toBe('25,10 45,20 25,30 5,20');
    expect(isDrawingDiamondShape('decision')).toBe(true);
    expect(isDrawingDiamondShape('rect')).toBe(false);
  });

  it('creates line path and label position from two points', (): void => {
    const source = { x: 10, y: 20 };
    const target = { x: 30, y: 60 };

    expect(createDrawingLinePath(source, target)).toBe('M 10 20 L 30 60');
    expect(getDrawingLineLabelPosition(source, target)).toEqual({ x: 20, y: 32 });
  });

  it('finds element IDs, DOM targets and element centers', (): void => {
    const root = document.createElement('div');
    const target = document.createElement('div');
    const element = createShapeElement('node-1');
    const elements: DrawingElement[] = [element];

    target.setAttribute('data-drawing-element-id', 'node-1');
    root.append(target);

    expect(getDrawingElementId(target)).toBe('node-1');
    expect(queryDrawingElementTarget(root, 'node-1')).toBe(target);
    expect(findDrawingShapeElement(elements, 'node-1')).toBe(element);
    expect(findDrawingElementCenter(elements, 'node-1')).toEqual({ x: 100, y: 100 });
  });
});
