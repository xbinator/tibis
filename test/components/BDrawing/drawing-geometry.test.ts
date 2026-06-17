/**
 * @file drawing-geometry.test.ts
 * @description 验证 BDrawing 共享几何工具的坐标、路径和 DOM 查询逻辑。
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import type {
  DrawingConnectorAnchor,
  DrawingConnectorElement,
  DrawingElement,
  DrawingPoint,
  DrawingShapeElement,
  DrawingViewport
} from '@/components/BDrawing/types';
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
 * 有明确外侧方向的连接线边缘锚点。
 */
type DrawingConnectorEdgeAnchor = Exclude<DrawingConnectorAnchor, 'center'>;

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

/**
 * 从 SVG 折线路径中解析路径点。
 * @param path - SVG path 字符串
 * @returns 路径点列表
 */
function parseConnectorPathPoints(path: string): DrawingPoint[] {
  return [...path.matchAll(/[ML] (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(
    (match: RegExpMatchArray): DrawingPoint => ({
      x: Number(match[1]),
      y: Number(match[2])
    })
  );
}

/**
 * 读取锚点朝向。
 * @param anchor - 连接线锚点
 * @returns 锚点外侧方向
 */
function getTestAnchorDirection(anchor: DrawingConnectorEdgeAnchor): DrawingPoint {
  const directions: Record<DrawingConnectorEdgeAnchor, DrawingPoint> = {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
  };

  return directions[anchor];
}

/**
 * 判断首段是否从起点锚点外侧离开。
 * @param points - 路径点
 * @param anchor - 起点锚点
 * @returns 是否从外侧离开
 */
function doesRouteLeaveSourceOutward(points: DrawingPoint[], anchor: DrawingConnectorEdgeAnchor): boolean {
  const direction = getTestAnchorDirection(anchor);
  const source = points[0];
  const next = points[1];

  return (next.x - source.x) * direction.x + (next.y - source.y) * direction.y > 0;
}

/**
 * 判断末段是否从终点锚点外侧进入。
 * @param points - 路径点
 * @param anchor - 终点锚点
 * @returns 是否从外侧进入
 */
function doesRouteEnterTargetOutward(points: DrawingPoint[], anchor: DrawingConnectorEdgeAnchor): boolean {
  const direction = getTestAnchorDirection(anchor);
  const target = points[points.length - 1];
  const previous = points[points.length - 2];

  return (previous.x - target.x) * direction.x + (previous.y - target.y) * direction.y > 0;
}

/**
 * 判断开区间数值范围是否相交。
 * @param start - 第一个区间起点
 * @param end - 第一个区间终点
 * @param min - 第二个区间起点
 * @param max - 第二个区间终点
 * @returns 是否存在内部相交
 */
function doesStrictRangeOverlap(start: number, end: number, min: number, max: number): boolean {
  return Math.max(Math.min(start, end), min) < Math.min(Math.max(start, end), max);
}

/**
 * 判断路径线段是否穿过形状内部。
 * @param start - 线段起点
 * @param end - 线段终点
 * @param element - 形状元素
 * @returns 是否穿过形状内部
 */
function doesSegmentCrossShapeInterior(start: DrawingPoint, end: DrawingPoint, element: DrawingShapeElement): boolean {
  const bounds = {
    minX: element.position.x,
    minY: element.position.y,
    maxX: element.position.x + element.size.width,
    maxY: element.position.y + element.size.height
  };

  if (start.x === end.x) {
    return start.x > bounds.minX && start.x < bounds.maxX && doesStrictRangeOverlap(start.y, end.y, bounds.minY, bounds.maxY);
  }

  if (start.y === end.y) {
    return start.y > bounds.minY && start.y < bounds.maxY && doesStrictRangeOverlap(start.x, end.x, bounds.minX, bounds.maxX);
  }

  return doesStrictRangeOverlap(start.x, end.x, bounds.minX, bounds.maxX) && doesStrictRangeOverlap(start.y, end.y, bounds.minY, bounds.maxY);
}

/**
 * 判断折线路径是否穿过形状内部。
 * @param points - 路径点
 * @param element - 形状元素
 * @returns 是否穿过形状内部
 */
function doesRouteCrossShapeInterior(points: DrawingPoint[], element: DrawingShapeElement): boolean {
  return points.slice(1).some((point: DrawingPoint, index: number): boolean => doesSegmentCrossShapeInterior(points[index], point, element));
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

  it('routes default connectors around their own endpoint nodes when anchors face away', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: -80, y: -60 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 160 100 L 184 100 L 184 -108 L -104 -108 L -104 -20 L -80 -20');
  });

  it('routes aligned default connectors around their own endpoint nodes when anchors face away', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: -80, y: 60 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 160 100 L 184 100 L 184 12 L -104 12 L -104 100 L -80 100');
  });

  it('routes same-side horizontal anchors through the shared outside lane', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'right' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: -80, y: -60 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 160 100 L 184 100 L 184 -20 L 64 -20 L 40 -20');
  });

  it('routes same-side vertical anchors through the shared outside lane', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'bottom' },
      target: { elementId: target.id, anchor: 'bottom' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: -80, y: -140 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 100 140 L 100 164 L -20 164 L -20 -36 L -20 -60');
  });

  it('routes same-side vertical anchors around a target that overlaps the source rail', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'top' },
      target: { elementId: target.id, anchor: 'top' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 40, y: -140 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 100 60 L 100 36 L 16 36 L 16 -164 L 100 -164 L 100 -140');
  });

  it('routes same-side vertical anchors around a source that overlaps the target rail', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'top' },
      target: { elementId: target.id, anchor: 'top' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    source.position = { x: 10, y: 120 };
    source.size = { width: 360, height: 200 };
    target.position = { x: 270, y: 420 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 190 120 L 190 96 L 414 96 L 414 396 L 330 396 L 330 420');
  });

  it('routes mixed horizontal and vertical anchors outside their own endpoint nodes', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'bottom' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: -80, y: -140 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 160 100 L 184 100 L 184 -36 L -20 -36 L -20 -60');
  });

  it('routes mixed vertical and horizontal anchors outside their own endpoint nodes', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'bottom' },
      target: { elementId: target.id, anchor: 'right' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: -80, y: -140 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 100 140 L 100 164 L 64 164 L 64 -100 L 40 -100');
  });

  it('keeps every anchor combination outside source and target node interiors', (): void => {
    const anchors: DrawingConnectorEdgeAnchor[] = ['top', 'right', 'bottom', 'left'];
    const targetPositions: DrawingPoint[] = [
      { x: -120, y: -140 },
      { x: 260, y: -140 },
      { x: 260, y: 220 },
      { x: -120, y: 220 }
    ];

    targetPositions.forEach((targetPosition: DrawingPoint): void => {
      anchors.forEach((sourceAnchor: DrawingConnectorEdgeAnchor): void => {
        anchors.forEach((targetAnchor: DrawingConnectorEdgeAnchor): void => {
          const source = createShapeElement('source');
          const target = createShapeElement('target');
          const connector: DrawingConnectorElement = {
            id: `connector-${sourceAnchor}-${targetAnchor}`,
            kind: 'connector',
            source: { elementId: source.id, anchor: sourceAnchor },
            target: { elementId: target.id, anchor: targetAnchor },
            markerEnd: 'none',
            position: { x: 0, y: 0 },
            size: { width: 0, height: 0 },
            rotation: 0,
            metadata: { source: 'user', createdAt: 1 }
          };

          target.position = targetPosition;

          const points = parseConnectorPathPoints(createDrawingConnectorPath([source, target, connector], connector));
          const caseName = `${sourceAnchor}->${targetAnchor} target(${targetPosition.x},${targetPosition.y})`;

          expect(points.length, caseName).toBeGreaterThanOrEqual(2);
          expect(doesRouteLeaveSourceOutward(points, sourceAnchor), caseName).toBe(true);
          expect(doesRouteEnterTargetOutward(points, targetAnchor), caseName).toBe(true);
          expect(doesRouteCrossShapeInterior(points, source), caseName).toBe(false);
          expect(doesRouteCrossShapeInterior(points, target), caseName).toBe(false);
        });
      });
    });
  });

  it('separates parallel connectors between the same anchors', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connectorA: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };
    const connectorB: DrawingConnectorElement = {
      ...connectorA,
      id: 'connector-2'
    };
    const connectorC: DrawingConnectorElement = {
      ...connectorA,
      id: 'connector-3'
    };

    target.position = { x: 320, y: 180 };

    expect(createDrawingConnectorPath([source, target, connectorA, connectorB, connectorC], connectorA)).toBe('M 160 100 L 240 100 L 240 220 L 320 220');
    expect(createDrawingConnectorPath([source, target, connectorA, connectorB, connectorC], connectorB)).toBe('M 160 100 L 258 100 L 258 220 L 320 220');
    expect(createDrawingConnectorPath([source, target, connectorA, connectorB, connectorC], connectorC)).toBe('M 160 100 L 222 100 L 222 220 L 320 220');
  });

  it('snaps nearly aligned vertical connectors into a single straight segment', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'bottom' },
      target: { elementId: target.id, anchor: 'top' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 48, y: 220 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 100 140 L 108 220');
  });

  it('keeps an elbow when vertical connector endpoints are outside the smaller snap range', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'bottom' },
      target: { elementId: target.id, anchor: 'top' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 54, y: 220 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 100 140 L 100 180 L 114 180 L 114 220');
  });

  it('snaps nearly aligned horizontal connectors into a single straight segment', (): void => {
    const source = createShapeElement('source');
    const target = createShapeElement('target');
    const connector: DrawingConnectorElement = {
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: source.id, anchor: 'right' },
      target: { elementId: target.id, anchor: 'left' },
      markerEnd: 'none',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      metadata: { source: 'user', createdAt: 1 }
    };

    target.position = { x: 220, y: 68 };

    expect(createDrawingConnectorPath([source, target, connector], connector)).toBe('M 160 100 L 220 108');
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
