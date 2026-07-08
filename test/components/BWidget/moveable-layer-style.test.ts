/**
 * @file moveable-layer-style.test.ts
 * @description 验证 BWidget Moveable 覆盖层样式约束。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** MoveableLayer 组件源码。 */
const moveableLayerSource = readFileSync(new URL('../../../src/components/BWidget/components/MoveableLayer.vue', import.meta.url), 'utf8');
/** WidgetCanvas 组件源码。 */
const widgetCanvasSource = readFileSync(new URL('../../../src/components/BWidget/renderers/WidgetCanvas.vue', import.meta.url), 'utf8');
/** BWidget 根组件源码。 */
const widgetRootSource = readFileSync(new URL('../../../src/components/BWidget/index.vue', import.meta.url), 'utf8');

/**
 * 读取选择器对应的首个样式块。
 * @param source - 源码文本
 * @param selector - 样式选择器
 * @returns 样式块内容
 */
function readStyleBlock(source: string, selector: string): string {
  const blockStart = source.indexOf(`${selector} {`);
  if (blockStart === -1) {
    return '';
  }

  const contentStart = blockStart + selector.length + 2;
  const contentEnd = source.indexOf('\n}', contentStart);

  return contentEnd === -1 ? '' : source.slice(contentStart, contentEnd);
}

describe('MoveableLayer styles', () => {
  it('renders the Moveable controller as an absolute canvas overlay', (): void => {
    const layerStyle = readStyleBlock(moveableLayerSource, '.b-widget-moveable-layer');

    expect(layerStyle).toContain('position: absolute;');
    expect(layerStyle).toContain('inset: 0;');
  });

  it('keeps the Moveable controller outside the transformed stage and uses accurate positioning', (): void => {
    const stageClassIndex = widgetCanvasSource.indexOf('class="b-widget-canvas__stage"');

    expect(stageClassIndex).toBeGreaterThan(-1);
    expect(widgetCanvasSource).not.toContain('<MoveableLayer');
    expect(widgetRootSource).toContain('<MoveableLayer');
    expect(moveableLayerSource).toContain(':container="root"');
    expect(moveableLayerSource).toContain(':root-container="root"');
    expect(moveableLayerSource).toContain(':use-accurate-position="true"');
  });

  it('sets stable cursors for Moveable controls and active drag state', (): void => {
    expect(moveableLayerSource).toContain(":deep(.moveable-control[data-direction='n'])");
    expect(moveableLayerSource).toContain(":deep(.moveable-control[data-direction='ne'])");
    expect(moveableLayerSource).toContain(":deep(.moveable-around-control[data-direction='n'])");
    expect(moveableLayerSource).toContain(":deep(.moveable-around-control[data-direction='ne'])");
    expect(moveableLayerSource).toContain(':deep(.moveable-control-box.dragging)');
    expect(moveableLayerSource).toContain('cursor: ns-resize !important;');
    expect(moveableLayerSource).toContain('cursor: ew-resize !important;');
    expect(moveableLayerSource).toContain('cursor: nesw-resize !important;');
    expect(moveableLayerSource).toContain('cursor: nwse-resize !important;');
    expect(moveableLayerSource).toContain('cursor: move !important;');
  });
});
