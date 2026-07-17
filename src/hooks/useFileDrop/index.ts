/**
 * @file index.ts
 * @description 通用文件拖拽 Hook，封装 DOM 拖拽态、文件 drop 分发与本地路径解析。
 */
import type { Ref } from 'vue';
import { onMounted, onUnmounted, ref } from 'vue';
import { native } from '@/shared/platform';

/**
 * 旧版 Electron 在 File 对象上暴露的路径字段。
 */
interface DraggedFileWithPath {
  /** 本地磁盘路径。 */
  path?: string;
}

/**
 * 通用文件拖拽 Hook 参数。
 */
interface UseFileDropOptions {
  /** 接收文件拖拽的目标元素引用。 */
  targetRef: Ref<HTMLElement | null | undefined>;
  /** 文件 drop 回调。 */
  onDropFiles: (files: File[], event: DragEvent) => Promise<void> | void;
}

/**
 * 从拖拽文件中解析本地磁盘路径。
 * @param file - 拖拽得到的浏览器 File 对象
 * @returns 本地磁盘路径；无法获取时返回 null
 */
export function resolveDroppedFilePath(file: File): string | null {
  const legacyPath = (file as unknown as DraggedFileWithPath).path;
  if (legacyPath) return legacyPath;

  return native.getPathForFile(file);
}

/**
 * 判断拖拽事件是否包含文件。
 * @param event - 拖拽事件
 * @returns 是否包含文件
 */
function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * 读取拖拽事件中的文件列表。
 * @param event - 拖拽事件
 * @returns 文件数组
 */
function getDroppedFiles(event: DragEvent): File[] {
  return Array.from(event.dataTransfer?.files ?? []);
}

/**
 * 管理目标元素的文件拖拽态，并在 drop 时分发文件列表。
 * @param options - Hook 参数
 * @returns 文件拖拽状态
 */
export function useFileDrop(options: UseFileDropOptions): { isDragging: Ref<boolean> } {
  /** 当前是否有文件拖拽悬停在目标元素上。 */
  const isDragging = ref(false);
  /** 目标元素内部拖拽嵌套深度，用于避免子元素切换时闪烁。 */
  const dragDepth = ref(0);

  /**
   * 清理当前拖拽态。
   */
  function resetDragState(): void {
    dragDepth.value = 0;
    isDragging.value = false;
  }

  /**
   * 处理文件进入目标元素。
   * @param event - 拖拽事件
   */
  function handleDragEnter(event: DragEvent): void {
    if (!hasDraggedFiles(event)) return;

    event.preventDefault();
    dragDepth.value += 1;
    isDragging.value = true;
  }

  /**
   * 处理文件在目标元素上方悬停。
   * @param event - 拖拽事件
   */
  function handleDragOver(event: DragEvent): void {
    if (!hasDraggedFiles(event)) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    isDragging.value = true;
  }

  /**
   * 处理文件离开目标元素。
   * @param event - 拖拽事件
   */
  function handleDragLeave(event: DragEvent): void {
    if (!hasDraggedFiles(event)) return;

    event.preventDefault();
    dragDepth.value = Math.max(0, dragDepth.value - 1);
    isDragging.value = dragDepth.value > 0;
  }

  /**
   * 处理文件投放到目标元素。
   * @param event - 拖拽事件
   */
  async function handleDrop(event: DragEvent): Promise<void> {
    if (!hasDraggedFiles(event)) return;

    resetDragState();

    if (event.defaultPrevented) return;

    event.preventDefault();
    const files = getDroppedFiles(event);
    if (files.length === 0) return;

    await options.onDropFiles(files, event);
  }

  /**
   * 将拖拽监听绑定到目标元素。
   */
  function bindListeners(): void {
    const element = options.targetRef.value;
    if (!element) return;

    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);
  }

  /**
   * 移除目标元素拖拽监听。
   */
  function unbindListeners(): void {
    const element = options.targetRef.value;
    if (!element) return;

    element.removeEventListener('dragenter', handleDragEnter);
    element.removeEventListener('dragover', handleDragOver);
    element.removeEventListener('dragleave', handleDragLeave);
    element.removeEventListener('drop', handleDrop);
  }

  onMounted(bindListeners);
  onUnmounted(unbindListeners);

  return {
    isDragging
  };
}
