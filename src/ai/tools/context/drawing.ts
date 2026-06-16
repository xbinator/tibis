/**
 * @file drawing.ts
 * @description Drawing 工具上下文注册表，管理活动画板的 AI 工具上下文。
 */
import type { DrawingData } from '@/components/BDrawing/types';

/**
 * Drawing AI 工具上下文。
 */
export interface DrawingToolContext {
  /** 画图文件 ID */
  id: string;
  /** 画图文件标题 */
  title: string;
  /** 画图文件路径，未保存时为 null */
  path: string | null;
  /** 读取当前画图数据 */
  getData: () => DrawingData;
  /** 替换当前画图数据 */
  replaceData: (data: DrawingData) => Promise<DrawingData>;
}

/**
 * Drawing 工具上下文注册表接口。
 */
export interface DrawingToolContextRegistry {
  /** 注册 Drawing 上下文 */
  register: (drawingId: string, context: DrawingToolContext) => void;
  /** 注销 Drawing 上下文 */
  unregister: (drawingId: string) => void;
  /** 获取当前活动 Drawing 上下文 */
  getCurrentContext: () => DrawingToolContext | undefined;
  /** 按 Drawing ID 获取上下文 */
  getContext: (drawingId: string) => DrawingToolContext | undefined;
}

/**
 * 创建 Drawing 工具上下文注册表。
 * @returns Drawing 工具上下文注册表
 */
export function createDrawingToolContextRegistry(): DrawingToolContextRegistry {
  /** Drawing ID 到上下文的映射。 */
  const contexts = new Map<string, DrawingToolContext>();
  /** 当前活动 Drawing ID。 */
  let activeDrawingId: string | null = null;

  return {
    register(drawingId: string, context: DrawingToolContext): void {
      contexts.set(drawingId, context);
      activeDrawingId = drawingId;
    },
    unregister(drawingId: string): void {
      contexts.delete(drawingId);

      if (activeDrawingId === drawingId) {
        activeDrawingId = Array.from(contexts.keys()).at(-1) ?? null;
      }
    },
    getCurrentContext(): DrawingToolContext | undefined {
      return activeDrawingId ? contexts.get(activeDrawingId) : undefined;
    },
    getContext(drawingId: string): DrawingToolContext | undefined {
      return contexts.get(drawingId);
    }
  };
}

/** 全局 Drawing 工具上下文注册表单例。 */
export const drawingToolContextRegistry = createDrawingToolContextRegistry();
