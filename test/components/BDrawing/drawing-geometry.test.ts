/**
 * @file drawing-geometry.test.ts
 * @description 验证 BDrawing 共享几何工具的坐标、路径和 DOM 查询逻辑。
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import type { DrawingConnectorElement, DrawingElement, DrawingShapeElement, DrawingViewport } from '@/components/BDrawing/types';
import {
  createDrawingConnectorMarkerPath,
  createDrawingConnectorPath,
  createDrawingDiamondPoints,
  createDrawingElementTransform,
  createDrawingLinePath,
  createDrawingViewBox,
  findDrawingElementCenter,
  findDrawingShapeElement,
  getDrawingConnectorLabelPosition,
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

  it('creates bezier connector paths when connector curve is bezier', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      curve: 'bezier',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 260, y: 120 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toContain(' C ');
  });

  it('points bezier end markers toward the target anchor', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      curve: 'bezier',
      markerEnd: 'arrow',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 260, y: 120 };

    expect(createDrawingConnectorMarkerPath([source, target, connector], connector, 'end')).toContain('L 248');
  });

  it('trims connector line endpoints under arrow markers', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'arrow',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 260, y: 60 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 160 100 L 248 100');
    expect(createDrawingConnectorMarkerPath([source, target, connector], connector, 'end')).toContain('M 260 100');
  });

  it('routes default connectors as orthogonal elbow paths between offset anchors', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'arrow',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 320, y: 180 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 160 100 L 240 100 L 240 220 L 308 220');
    expect(createDrawingConnectorMarkerPath([source, target, connector], connector, 'end')).toContain('M 320 220');
  });

  it('places default connector labels on the middle segment of an orthogonal route', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'arrow',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 320, y: 180 };

    expect(getDrawingConnectorLabelPosition([source, target, connector], connector)).toEqual({ x: 240, y: 152 });
  });

  it('routes default connectors around blocking shapes', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const blocker: DrawingShapeElement = {
      ...createShapeElement('blocker'),
      position: { x: 250, y: 120 },
      size: { width: 120, height: 100 }
    };
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'arrow',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 420, y: 180 };

    expect(createDrawingConnectorPath([source, target, blocker, connector], connector)).toBe('M 160 100 L 184 100 L 184 72 L 396 72 L 396 220 L 408 220');
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
