/**
 * @file image.ts
 * @description 图片与 SVG 渲染工具函数。
 */

/**
 * SVG 可绘制尺寸。
 */
interface SvgRenderSize {
  /** SVG 宽度 */
  width: number;
  /** SVG 高度 */
  height: number;
}

/**
 * 图片工具结果模式。
 */
type ImageResult<T> = [Error] | [undefined, T];

/**
 * 下载图片并读取为二进制。
 * @param src - 图片地址
 * @param errorMessage - 下载失败时返回的错误提示
 * @returns 图片二进制内容结果
 */
export async function downloadImageArrayBuffer(src: string, errorMessage = '图片下载失败'): Promise<ImageResult<ArrayBuffer>> {
  try {
    const response = await fetch(src);

    if (!response.ok) {
      return [new Error(errorMessage)];
    }

    return [undefined, await response.arrayBuffer()];
  } catch (error: unknown) {
    return [error instanceof Error ? error : new Error(errorMessage)];
  }
}

/**
 * 读取 SVG 数值属性。
 * @param value - SVG 属性值
 * @returns 可用数值，无法读取时返回 null
 */
function parseSvgNumber(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 读取 SVG 的可绘制尺寸。
 * @param svgElement - SVG 元素
 * @returns SVG 渲染尺寸
 */
function getSvgRenderSize(svgElement: SVGSVGElement): SvgRenderSize {
  const width = parseSvgNumber(svgElement.getAttribute('width'));
  const height = parseSvgNumber(svgElement.getAttribute('height'));

  if (width && height) return { width, height };

  const viewBox = svgElement.viewBox.baseVal;
  if (viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const rect = svgElement.getBoundingClientRect();
  return {
    width: Math.max(rect.width, 1),
    height: Math.max(rect.height, 1)
  };
}

/**
 * 将 Blob 加载为图片元素。
 * @param blob - 图片 Blob
 * @returns 可绘制图片元素结果
 */
export async function loadImageFromBlob(blob: Blob): Promise<ImageResult<HTMLImageElement>> {
  const url = URL.createObjectURL(blob);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('图片生成失败'));
      image.src = url;
    });

    return [undefined, image];
  } catch (error: unknown) {
    return [error instanceof Error ? error : new Error('图片生成失败')];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 将 canvas 导出为 PNG 二进制。
 * @param canvas - 已绘制内容的 canvas
 * @returns PNG ArrayBuffer 结果
 */
export async function canvasToPngArrayBuffer(canvas: HTMLCanvasElement): Promise<ImageResult<ArrayBuffer>> {
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value: Blob | null) => {
        if (!value) {
          reject(new Error('图片生成失败'));
          return;
        }

        resolve(value);
      }, 'image/png');
    });

    return [undefined, await blob.arrayBuffer()];
  } catch (error: unknown) {
    return [error instanceof Error ? error : new Error('图片生成失败')];
  }
}

/**
 * 将 SVG 元素渲染为 PNG 二进制。
 * @param svgElement - 待渲染的 SVG 元素
 * @returns PNG ArrayBuffer 结果
 */
export async function svgElementToPngArrayBuffer(svgElement: SVGSVGElement): Promise<ImageResult<ArrayBuffer>> {
  if (!svgElement.getAttribute('xmlns')) {
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const { width, height } = getSvgRenderSize(svgElement);
  const svgText = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const [imageError, image] = await loadImageFromBlob(svgBlob);

  if (imageError) return [imageError];

  const canvas = document.createElement('canvas');
  const scale = Math.max(window.devicePixelRatio || 1, 1);
  const context = canvas.getContext('2d');

  if (!context) {
    return [new Error('当前环境无法生成图片')];
  }

  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  return canvasToPngArrayBuffer(canvas);
}
