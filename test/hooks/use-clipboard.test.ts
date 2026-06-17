/**
 * @file use-clipboard.test.ts
 * @description 剪贴板 Hook 图片复制能力测试。
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipboard } from '@/hooks/useClipboard';
import { native } from '@/shared/platform/native';

const vueUseCopyMock = vi.hoisted(() => vi.fn());
const messageSuccessMock = vi.hoisted(() => vi.fn());
const messageErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@vueuse/core', () => ({
  useClipboard: () => ({
    copy: vueUseCopyMock
  })
}));

vi.mock('ant-design-vue', () => ({
  message: {
    success: messageSuccessMock,
    error: messageErrorMock
  }
}));

vi.mock('@/shared/platform/native', () => ({
  native: {
    copyImageToClipboard: vi.fn().mockResolvedValue(undefined)
  }
}));

let originalImage: typeof Image;

/**
 * 安装 SVG 图片复制需要的浏览器 API 替身。
 */
function installSvgImageBrowserStubs(): void {
  const originalCreateElement = document.createElement.bind(document);
  const canvasElement = originalCreateElement('canvas') as HTMLCanvasElement;
  const context = {
    scale: vi.fn(),
    drawImage: vi.fn()
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(canvasElement, 'getContext').mockReturnValue(context);
  vi.spyOn(canvasElement, 'toBlob').mockImplementation((callback: BlobCallback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });

  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === 'canvas') return canvasElement;

    return originalCreateElement(tagName, options);
  }) as typeof document.createElement);

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clipboard-svg');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  class TestImage {
    /** 图片加载完成回调 */
    onload: (() => void) | null = null;

    /** 图片加载失败回调 */
    onerror: (() => void) | null = null;

    /**
     * 触发图片加载。
     * @param _value - 图片地址
     */
    set src(_value: string) {
      this.onload?.();
    }
  }

  originalImage = globalThis.Image;
  globalThis.Image = TestImage as unknown as typeof Image;
}

/**
 * 创建测试用 SVG 元素。
 * @returns SVG 元素
 */
function createSvgElement(): SVGSVGElement {
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const rectElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

  svgElement.setAttribute('width', '120');
  svgElement.setAttribute('height', '80');
  rectElement.setAttribute('width', '120');
  rectElement.setAttribute('height', '80');
  svgElement.appendChild(rectElement);

  return svgElement;
}

describe('useClipboard', (): void => {
  beforeEach((): void => {
    vi.clearAllMocks();
    installSvgImageBrowserStubs();
  });

  afterEach((): void => {
    globalThis.Image = originalImage;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders an SVG element to PNG before copying it as an image', async (): Promise<void> => {
    const { copyImage } = useClipboard();
    const copied = await copyImage(createSvgElement(), {
      successMessage: '复制成功',
      errorMessage: '复制图片失败'
    });

    const copiedBuffer = vi.mocked(native.copyImageToClipboard).mock.calls[0]?.[0];

    expect(copied).toBe(true);
    expect(copiedBuffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(copiedBuffer ?? new ArrayBuffer(0)))).toEqual([112, 110, 103]);
    expect(messageSuccessMock).toHaveBeenCalledWith('复制成功');
    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('downloads an image URL before copying it as an image', async (): Promise<void> => {
    const imageBytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(imageBytes, { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const { copyImage } = useClipboard();
    const copied = await copyImage('https://example.test/image.png', {
      successMessage: '复制成功',
      errorMessage: '复制图片失败'
    });

    const copiedBuffer = vi.mocked(native.copyImageToClipboard).mock.calls[0]?.[0];

    expect(copied).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/image.png');
    expect(Array.from(new Uint8Array(copiedBuffer ?? new ArrayBuffer(0)))).toEqual([1, 2, 3]);
    expect(messageSuccessMock).toHaveBeenCalledWith('复制成功');
    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('copies image ArrayBuffer content directly', async (): Promise<void> => {
    const imageBuffer = new Uint8Array([9, 8, 7]).buffer;

    const { copyImage } = useClipboard();
    const copied = await copyImage(imageBuffer, {
      successMessage: '复制成功',
      errorMessage: '复制图片失败'
    });

    expect(copied).toBe(true);
    expect(native.copyImageToClipboard).toHaveBeenCalledWith(imageBuffer);
    expect(messageSuccessMock).toHaveBeenCalledWith('复制成功');
    expect(messageErrorMock).not.toHaveBeenCalled();
  });
});
