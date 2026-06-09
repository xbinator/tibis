/**
 * @file useImagePreview.ts
 * @description 图片预览入口 hook，优先调用 Electron 原生能力，失败时回退到应用内查看器。
 */
import type { ElectronImagePreviewRequest } from 'types/electron-api';
import { createVNode, nextTick, render as vueRender } from 'vue';
import { clamp } from 'lodash-es';
import BImageViewer from '@/components/BImageViewer/index.vue';

/**
 * 可预览图片条目。
 */
export interface ImagePreviewItem extends ElectronImagePreviewRequest {
  /** 图片地址、本地路径或 data URL */
  src: string;
}

/**
 * 图片预览参数。
 */
export interface ImagePreviewOptions {
  /** 可预览图片列表 */
  images: ImagePreviewItem[];
  /** 起始预览位置 */
  startPosition: number;
  /** 是否展示底部缩略图轮播 */
  showCarousel?: boolean;
}

/**
 * 图片预览操作集合。
 */
export interface ImagePreviewActions {
  /**
   * 打开图片预览。
   * @param options - 图片预览参数
   */
  previewImage(options: ImagePreviewOptions): Promise<void>;
}

/**
 * 已规范化的图片预览参数。
 */
type NormalizedImagePreviewOptions = ImagePreviewOptions & {
  /** 起始预览位置 */
  startPosition: number;
};

/** 应用内图片查看器渲染容器。 */
let viewerContainer: HTMLElement | null = null;

/**
 * 获取程序化渲染容器。
 * @returns 图片查看器渲染容器
 */
function getViewerContainer(): HTMLElement {
  if (!viewerContainer) {
    viewerContainer = document.createElement('div');
  }

  return viewerContainer;
}

/**
 * 创建图片预览操作。
 * @returns 图片预览操作集合
 */
export function useImagePreview(): ImagePreviewActions {
  /**
   * 规范化图片预览参数。
   * @param options - 图片预览参数
   * @returns 规范化后的参数；没有图片时返回 null
   */
  function normalizeOptions(options: ImagePreviewOptions): NormalizedImagePreviewOptions | null {
    if (!options.images.length) return null;

    return {
      ...options,
      startPosition: clamp(options.startPosition, 0, options.images.length - 1)
    };
  }

  /**
   * 销毁程序化渲染的应用内图片查看器。
   */
  function destroyFallbackViewer(): void {
    vueRender(null, getViewerContainer());
  }

  /**
   * 渲染应用内图片查看器。
   * @param options - 图片预览参数
   * @param show - 是否显示查看器
   */
  function renderFallbackViewer(options: ImagePreviewOptions, show: boolean): void {
    const viewer = createVNode(BImageViewer, {
      show,
      images: options.images.map((image) => image.src),
      startPosition: options.startPosition,
      showCarousel: options.showCarousel,
      'onUpdate:show': (nextShow: boolean): void => {
        if (!nextShow) {
          destroyFallbackViewer();
        }
      }
    });

    vueRender(viewer, getViewerContainer());
  }

  /**
   * 使用应用内查看器打开图片。
   * @param options - 图片预览参数
   */
  async function openFallback(options: ImagePreviewOptions): Promise<void> {
    // BImageViewer 依赖 show 从 false 切换到 true 来触发首次图片尺寸初始化。
    renderFallbackViewer(options, false);
    await nextTick();
    renderFallbackViewer(options, true);
  }

  /**
   * 调用 Electron 图片预览能力。
   * @param image - 待预览图片
   * @returns 是否已完成原生预览
   */
  async function openElectronPreview(image: ImagePreviewItem): Promise<boolean> {
    const electronPreviewImage = window.electronAPI?.previewImage;
    if (!electronPreviewImage) return false;

    const result = await electronPreviewImage({ src: image.src, name: image.name, mimeType: image.mimeType });
    return result.opened;
  }

  /**
   * 打开图片预览，Electron 环境优先使用系统/独立窗口能力。
   * @param options - 图片预览参数
   */
  async function previewImage(options: ImagePreviewOptions): Promise<void> {
    try {
      const normalizedOptions = normalizeOptions(options);
      if (!normalizedOptions) return;

      const image = normalizedOptions.images[normalizedOptions.startPosition];
      if (await openElectronPreview(image)) return;

      await openFallback(normalizedOptions);
    } catch {
      // 预览失败时不向业务层抛错，保持调用方无需做错误兼容。
    }
  }

  return { previewImage };
}
