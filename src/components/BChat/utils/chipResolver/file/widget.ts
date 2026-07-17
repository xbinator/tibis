/**
 * @file widget.ts
 * @description 文件引用 CodeMirror Widget 与创建函数。
 */
import { createApp, type App } from 'vue';
import { WidgetType } from '@codemirror/view';
import BRecentIcon from '@/components/BRecent/Icon.vue';
import type { FileReferenceNavigationTarget, ParsedFileReference } from '@/utils/file/reference';
import { createFileRefChipElement, createFileRefChipPresentation } from './presentation';

/**
 * 将解析结果转换为文件导航目标。
 * @param parsed - 已解析的文件引用
 * @returns 文件导航目标
 */
function toNavigationTarget(parsed: ParsedFileReference): FileReferenceNavigationTarget {
  return {
    rawPath: parsed.rawPath,
    filePath: parsed.filePath,
    fileId: parsed.fileId,
    fileName: parsed.fileName,
    startLine: parsed.startLine,
    endLine: parsed.endLine
  };
}

/** 文件引用 CodeMirror Widget。 */
class FileRefWidget extends WidgetType {
  /** 当前 Widget 创建过的图标 Vue 应用，随 DOM 销毁卸载。 */
  private readonly iconApps = new WeakMap<HTMLElement, App<Element>>();

  /**
   * 创建文件引用 Widget。
   * @param location - 已解析的文件引用
   * @param onOpenFile - 文件打开回调
   */
  constructor(private readonly location: ParsedFileReference, private readonly onOpenFile: (target: FileReferenceNavigationTarget) => void) {
    super();
  }

  /**
   * 判断两个文件引用 Widget 是否等价。
   * @param other - 另一个 Widget
   * @returns 展示位置是否一致
   */
  eq(other: FileRefWidget): boolean {
    return (
      this.location.rawPath === other.location.rawPath &&
      this.location.filePath === other.location.filePath &&
      this.location.fileId === other.location.fileId &&
      this.location.fileName === other.location.fileName &&
      this.location.startLine === other.location.startLine &&
      this.location.endLine === other.location.endLine &&
      this.location.isUnsaved === other.location.isUnsaved
    );
  }

  /**
   * 创建文件引用 DOM。
   * @returns Widget 根节点
   */
  toDOM(): HTMLElement {
    const presentation = createFileRefChipPresentation({
      title: this.location.filePath ?? this.location.fileName,
      fileName: this.location.fileName,
      startLine: this.location.startLine,
      endLine: this.location.endLine
    });
    const chip = createFileRefChipElement(presentation);
    const iconHost = document.createElement('span');
    iconHost.className = presentation.iconClass;
    const iconApp = createApp(BRecentIcon, { fileName: presentation.fileName, size: 14 });

    iconApp.mount(iconHost);
    chip.insertBefore(iconHost, chip.firstChild);
    this.iconApps.set(chip, iconApp);

    chip.addEventListener('mousedown', (event: MouseEvent): void => event.preventDefault());
    chip.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      this.onOpenFile(toNavigationTarget(this.location));
    });
    chip.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.onOpenFile(toNavigationTarget(this.location));
    });

    return chip;
  }

  /**
   * 销毁文件图标 Vue 应用。
   * @param dom - Widget 根节点
   */
  destroy(dom: HTMLElement): void {
    const iconApp = this.iconApps.get(dom);
    if (!iconApp) return;
    iconApp.unmount();
    this.iconApps.delete(dom);
  }

  /**
   * 保留 Widget 内键盘与鼠标事件。
   * @returns 不忽略事件
   */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 创建文件引用 CodeMirror Widget。
 * @param location - 已解析的文件引用
 * @param onOpenFile - 文件打开回调
 * @returns 文件引用 Widget
 */
export function createFileReferenceWidget(location: ParsedFileReference, onOpenFile: (target: FileReferenceNavigationTarget) => void): WidgetType {
  return new FileRefWidget(location, onOpenFile);
}
