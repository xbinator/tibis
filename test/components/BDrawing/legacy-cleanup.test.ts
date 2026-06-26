/**
 * @file legacy-cleanup.test.ts
 * @description 验证 BDrawing 已移除旧版内置流程图工具残留。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取 BDrawing 源码文件。
 * @param path - BDrawing 目录内相对路径
 * @returns 源码内容
 */
function readBDrawingSource(path: string): string {
  return readFileSync(resolve(process.cwd(), 'src/components/BDrawing', path), 'utf8');
}

describe('BDrawing legacy cleanup', (): void => {
  it('does not keep the removed process-specific id generator', (): void => {
    const source = readBDrawingSource('hooks/useDrawingBoard.ts');

    expect(source).not.toContain('drawing-node-');
    expect(source).not.toContain('isProcessShape');
  });

  it('does not keep hard-coded creation tool names in shared interaction code', (): void => {
    const interactionSource = readBDrawingSource('constants/interaction.ts');
    const drawingSource = readBDrawingSource('index.vue');
    const canvasSource = readBDrawingSource('renderers/DrawingCanvas.vue');

    expect(interactionSource).not.toContain('DRAWING_SHAPE_TOOLS');
    expect(interactionSource).not.toContain("['process', 'rect', 'ellipse', 'diamond', 'text']");
    expect(drawingSource).not.toContain('DRAWING_SHAPE_TOOLS');
    expect(canvasSource).not.toContain('is-tool-process');
    expect(canvasSource).not.toContain('is-tool-ellipse');
    expect(canvasSource).not.toContain('is-tool-diamond');
  });
});
