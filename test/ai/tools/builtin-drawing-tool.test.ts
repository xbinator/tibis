/**
 * @file builtin-drawing-tool.test.ts
 * @description 验证内置 Drawing AI 工具的读取与写入行为。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  APPLY_DRAWING_OPERATIONS_TOOL_NAME,
  READ_CURRENT_DRAWING_TOOL_NAME,
  UPDATE_CURRENT_DRAWING_TOOL_NAME,
  createBuiltinDrawingTools
} from '@/ai/tools/builtin/DrawingTool';
import type { DrawingToolContext } from '@/ai/tools/context/drawing';
import type { DrawingConnectorElement, DrawingData, DrawingEdge, DrawingShapeElement } from '@/components/BDrawing/types';

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
    text: '节点',
    position: { x: 20, y: 30 },
    size: { width: 180, height: 72 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: 1
    }
  };
}

/**
 * 创建测试连接线元素。
 * @param id - 连接线 ID
 * @param sourceId - 起点元素 ID
 * @param targetId - 终点元素 ID
 * @returns 测试连接线元素
 */
function createConnectorElement(id: string, sourceId: string, targetId: string): DrawingConnectorElement {
  return {
    id,
    kind: 'connector',
    source: {
      elementId: sourceId,
      anchor: 'center'
    },
    target: {
      elementId: targetId,
      anchor: 'center'
    },
    markerEnd: 'arrow',
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: 1
    }
  };
}

/**
 * 创建测试兼容连线数据。
 * @param id - 连线 ID
 * @param sourceId - 起点元素 ID
 * @param targetId - 终点元素 ID
 * @returns 测试兼容连线数据
 */
function createEdge(id: string, sourceId: string, targetId: string): DrawingEdge {
  return {
    id,
    type: 'arrow',
    sourceId,
    targetId,
    metadata: {
      source: 'user',
      createdAt: 1
    }
  };
}

/**
 * 创建测试画图数据。
 * @param id - 元素 ID
 * @returns 测试画图数据
 */
function createDrawingData(id: string): DrawingData {
  return {
    elements: [createShapeElement(id)],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

describe('DrawingTool', (): void => {
  it('reads the current drawing data from the active drawing context', async (): Promise<void> => {
    const context: DrawingToolContext = {
      id: 'drawing-1',
      title: '流程图.tibis',
      path: '/tmp/flow.tibis',
      getData: () => createDrawingData('node-1'),
      replaceData: async () => createDrawingData('node-1')
    };
    const tools = createBuiltinDrawingTools({ getDrawingContext: () => context });

    const result = await tools.readCurrentDrawing.execute({});

    expect(result.status).toBe('success');
    expect(result.toolName).toBe(READ_CURRENT_DRAWING_TOOL_NAME);
    expect(result.data).toEqual({
      id: 'drawing-1',
      title: '流程图.tibis',
      path: '/tmp/flow.tibis',
      data: createDrawingData('node-1')
    });
  });

  it('updates the current drawing data through the active drawing context', async (): Promise<void> => {
    const nextData = createDrawingData('node-2');
    const replaceData = vi.fn<(data: DrawingData) => Promise<DrawingData>>().mockResolvedValue(nextData);
    const context: DrawingToolContext = {
      id: 'drawing-1',
      title: '流程图.tibis',
      path: null,
      getData: () => createDrawingData('node-1'),
      replaceData
    };
    const tools = createBuiltinDrawingTools({ getDrawingContext: () => context });

    const result = await tools.updateCurrentDrawing.execute({
      data: nextData
    });

    expect(replaceData).toHaveBeenCalledWith(nextData);
    expect(result.status).toBe('success');
    expect(result.toolName).toBe(UPDATE_CURRENT_DRAWING_TOOL_NAME);
    expect(result.data).toEqual({
      id: 'drawing-1',
      title: '流程图.tibis',
      path: null,
      data: nextData
    });
  });

  it('applies drawing operations and preserves the current viewport', async (): Promise<void> => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T08:00:00.000Z'));
    const initialData = createDrawingData('node-1');
    const replaceData = vi.fn<(data: DrawingData) => Promise<DrawingData>>().mockImplementation(async (data: DrawingData): Promise<DrawingData> => data);
    const context: DrawingToolContext = {
      id: 'drawing-1',
      title: '流程图.tibis',
      path: null,
      getData: () => initialData,
      replaceData
    };
    const tools = createBuiltinDrawingTools({ getDrawingContext: () => context });

    const result = await tools.applyDrawingOperations.execute({
      operations: [
        {
          type: 'add_shape',
          shape: 'rect',
          text: '新增节点',
          position: { x: 240, y: 90 },
          size: { width: 160, height: 80 }
        },
        {
          type: 'update_shape_text',
          id: 'node-1',
          text: '开始'
        },
        {
          type: 'move_shape',
          id: 'node-1',
          position: { x: 60, y: 70 }
        },
        {
          type: 'add_connector',
          sourceId: 'node-1',
          targetId: 'drawing-ai-shape-1',
          sourceAnchor: 'right',
          targetAnchor: 'left',
          label: '下一步'
        }
      ]
    });

    expect(result.status).toBe('success');
    expect(result.toolName).toBe(APPLY_DRAWING_OPERATIONS_TOOL_NAME);
    expect(replaceData).toHaveBeenCalledTimes(1);
    const nextData = replaceData.mock.calls[0]?.[0];
    expect(nextData).toMatchObject({
      viewport: initialData.viewport,
      elements: [
        {
          id: 'node-1',
          text: '开始',
          position: { x: 60, y: 70 }
        },
        {
          id: 'drawing-ai-shape-1',
          kind: 'shape',
          shape: 'rect',
          text: '新增节点',
          position: { x: 240, y: 90 },
          size: { width: 160, height: 80 }
        },
        {
          id: 'drawing-ai-connector-1',
          kind: 'connector',
          source: { elementId: 'node-1', anchor: 'right' },
          target: { elementId: 'drawing-ai-shape-1', anchor: 'left' },
          label: '下一步'
        }
      ],
      edges: [
        {
          id: 'drawing-ai-connector-1',
          type: 'arrow',
          sourceId: 'node-1',
          targetId: 'drawing-ai-shape-1',
          label: '下一步'
        }
      ]
    });
    expect(result.data).toMatchObject({
      appliedOperations: 4,
      data: nextData
    });
    vi.useRealTimers();
  });

  it('removes connectors that reference a deleted shape', async (): Promise<void> => {
    const initialData = createDrawingData('node-1');
    initialData.elements.push(createShapeElement('node-2'), createConnectorElement('edge-1', 'node-1', 'node-2'));
    initialData.edges.push(createEdge('edge-1', 'node-1', 'node-2'));
    const replaceData = vi.fn<(data: DrawingData) => Promise<DrawingData>>().mockImplementation(async (data: DrawingData): Promise<DrawingData> => data);
    const context: DrawingToolContext = {
      id: 'drawing-1',
      title: '流程图.tibis',
      path: null,
      getData: () => initialData,
      replaceData
    };
    const tools = createBuiltinDrawingTools({ getDrawingContext: () => context });

    const result = await tools.applyDrawingOperations.execute({
      operations: [{ type: 'delete_element', id: 'node-1' }]
    });

    expect(result.status).toBe('success');
    const nextData = replaceData.mock.calls[0]?.[0];
    expect(nextData?.elements.map((element) => element.id)).toEqual(['node-2']);
    expect(nextData?.edges).toEqual([]);
  });

  it('rejects invalid drawing operations without replacing data', async (): Promise<void> => {
    const replaceData = vi.fn<(data: DrawingData) => Promise<DrawingData>>();
    const context: DrawingToolContext = {
      id: 'drawing-1',
      title: '流程图.tibis',
      path: null,
      getData: () => createDrawingData('node-1'),
      replaceData
    };
    const tools = createBuiltinDrawingTools({ getDrawingContext: () => context });

    const result = await tools.applyDrawingOperations.execute({
      operations: [
        {
          type: 'add_connector',
          sourceId: 'node-1',
          targetId: 'missing-node'
        }
      ]
    });

    expect(result.status).toBe('failure');
    if (result.status !== 'failure') {
      throw new Error('Expected apply_drawing_operations to fail for a missing connector target');
    }
    expect(result.toolName).toBe(APPLY_DRAWING_OPERATIONS_TOOL_NAME);
    expect(result.error.code).toBe('INVALID_INPUT');
    expect(replaceData).not.toHaveBeenCalled();
  });

  it('returns a failure when no active drawing context exists', async (): Promise<void> => {
    const tools = createBuiltinDrawingTools({ getDrawingContext: () => undefined });

    const result = await tools.readCurrentDrawing.execute({});

    expect(result.status).toBe('failure');
    if (result.status !== 'failure') {
      throw new Error('Expected read_current_drawing to fail without active context');
    }
    expect(result.error.code).toBe('NO_ACTIVE_DOCUMENT');
  });
});
