/**
 * @file screenshot.test.ts
 * @description 验证 WebView 截图辅助函数。
 */
import { describe, expect, it } from 'vitest';
import {
  buildFixedElementOverlayCaptures,
  buildPageCaptureSlices,
  buildScreenshotDefaultPath,
  createFixedElementVisibilityScript,
  createPngBlob
} from '@/views/webview/web/utils/screenshot';

describe('screenshot utilities', () => {
  it('builds full-page capture slices without losing the page tail', () => {
    const slices = buildPageCaptureSlices({
      contentHeight: 2500,
      maxScrollTop: 1500,
      scrollTop: 320,
      viewportHeight: 1000,
      viewportWidth: 1280
    });

    expect(slices).toEqual([
      { offsetY: 0, height: 1000, scrollTop: 0, sourceY: 0, captureFixedElements: true },
      { offsetY: 1000, height: 1000, scrollTop: 1000, sourceY: 0, captureFixedElements: false },
      { offsetY: 2000, height: 500, scrollTop: 1500, sourceY: 500, captureFixedElements: false }
    ]);
  });

  it('includes the capture mode in the default screenshot filename', () => {
    const filePath = buildScreenshotDefaultPath('Example / Page', 'full-page', new Date('2026-06-03T12:34:56.000Z'));

    expect(filePath).toMatch(/^Example Page-full-page-2026-06-03-12-34-56\.png$/);
  });

  it('creates a png blob directly from array buffer bytes', () => {
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
    const blob = createPngBlob(bytes);

    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(4);
  });

  it('waits for repaint after toggling fixed element visibility', () => {
    const script = createFixedElementVisibilityScript(false);

    expect(script).toContain('requestAnimationFrame');
    expect(script).toContain('visibility: hidden !important;');
    expect(script).toContain('position: relative !important;');
  });

  it('maps top and bottom fixed elements to different overlay capture positions', () => {
    const captures = buildFixedElementOverlayCaptures(
      {
        contentHeight: 2600,
        maxScrollTop: 1600,
        scrollTop: 0,
        viewportHeight: 1000,
        viewportWidth: 1280
      },
      [
        [{ id: 'top-banner', role: 'top', top: 16, left: 24, width: 320, height: 48 }],
        [{ id: 'bottom-bar', role: 'bottom', top: 920, left: 0, width: 1280, height: 80 }]
      ],
      [0, 1600]
    );

    expect(captures).toEqual([
      {
        scrollTop: 0,
        roles: ['top'],
        overlays: [{ sourceX: 24, sourceY: 16, width: 320, height: 48, targetX: 24, targetY: 16 }]
      },
      {
        scrollTop: 1600,
        roles: ['bottom'],
        overlays: [{ sourceX: 0, sourceY: 920, width: 1280, height: 80, targetX: 0, targetY: 2520 }]
      }
    ]);
  });

  it('keeps first-slice top overlays and last-slice bottom overlays while dropping mid-appearing overlays', () => {
    const captures = buildFixedElementOverlayCaptures(
      {
        contentHeight: 2600,
        maxScrollTop: 1600,
        scrollTop: 0,
        viewportHeight: 1000,
        viewportWidth: 1280
      },
      [
        [
          { id: 'top-banner', role: 'top', top: 16, left: 24, width: 320, height: 48 },
          { id: 'bottom-bar', role: 'bottom', top: 920, left: 0, width: 1280, height: 80 }
        ],
        [
          { id: 'mid-sticky', role: 'top', top: 0, left: 0, width: 400, height: 44 },
          { id: 'bottom-bar', role: 'bottom', top: 920, left: 0, width: 1280, height: 80 }
        ],
        [{ id: 'bottom-bar', role: 'bottom', top: 920, left: 0, width: 1280, height: 80 }]
      ],
      [0, 1000, 1600]
    );

    expect(captures).toEqual([
      {
        scrollTop: 0,
        roles: ['top'],
        overlays: [{ sourceX: 24, sourceY: 16, width: 320, height: 48, targetX: 24, targetY: 16 }]
      },
      {
        scrollTop: 1600,
        roles: ['bottom'],
        overlays: [{ sourceX: 0, sourceY: 920, width: 1280, height: 80, targetX: 0, targetY: 2520 }]
      }
    ]);
  });
});
