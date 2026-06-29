/**
 * @file legacy-cleanup.test.ts
 * @description 验证 BWidget 已移除旧版内置流程图工具残留。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取 BWidget 源码文件。
 * @param path - BWidget 目录内相对路径
 * @returns 源码内容
 */
function readBWidgetSource(path: string): string {
  return readFileSync(resolve(process.cwd(), 'src/components/BWidget', path), 'utf8');
}

describe('BWidget legacy cleanup', (): void => {
  it('does not keep the removed process-specific id generator', (): void => {
    const source = readBWidgetSource('hooks/useWidgetBoard.ts');

    expect(source).not.toContain('widget-node-');
    expect(source).not.toContain('isProcessShape');
  });

  it('does not keep hard-coded creation tool names in shared interaction code', (): void => {
    const interactionSource = readBWidgetSource('constants/interaction.ts');
    const widgetSource = readBWidgetSource('index.vue');
    const canvasSource = readBWidgetSource('renderers/WidgetCanvas.vue');

    expect(interactionSource).not.toContain('WIDGET_SHAPE_TOOLS');
    expect(interactionSource).not.toContain("['process', 'rect', 'ellipse', 'diamond', 'text']");
    expect(widgetSource).not.toContain('WIDGET_SHAPE_TOOLS');
    expect(canvasSource).not.toContain('is-tool-process');
    expect(canvasSource).not.toContain('is-tool-ellipse');
    expect(canvasSource).not.toContain('is-tool-diamond');
  });
});
