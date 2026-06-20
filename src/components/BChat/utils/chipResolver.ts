/**
 * @file chipResolver.ts
 * @description 聊天输入框 Chip 解析器，将 file-ref token 解析为渲染 Widget。
 */
import { WidgetType } from '@codemirror/view';
import { createFileRefChipElement, createFileRefChipPresentation } from '@/components/BChat/components/FileRefChip';
import type { ChipResolver } from '@/components/BPromptEditor/extensions/variableChip';
import { parseFileReferenceToken, type FileReferenceNavigationTarget, type ParsedFileReference } from '@/utils/file/reference';

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

/**
 * 文件引用 Chip Widget，由 chipResolver 返回。
 */
class FileRefWidget extends WidgetType {
  constructor(private readonly location: ParsedFileReference, private readonly onOpenFile: (target: FileReferenceNavigationTarget) => void) {
    super();
  }

  eq(other: FileRefWidget): boolean {
    return (
      this.location.fileName === other.location.fileName &&
      this.location.startLine === other.location.startLine &&
      this.location.endLine === other.location.endLine
    );
  }

  toDOM(): HTMLElement {
    const presentation = createFileRefChipPresentation({
      title: this.location.filePath ?? this.location.fileName,
      fileName: this.location.fileName,
      startLine: this.location.startLine,
      endLine: this.location.endLine
    });
    const chip = createFileRefChipElement(presentation);

    chip.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onOpenFile(toNavigationTarget(this.location));
    });
    chip.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.onOpenFile(toNavigationTarget(this.location));
      }
    });

    return chip;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 创建文件引用 chip 解析器。
 * @param onOpenFile - 文件打开回调
 * @returns PromptEditor 可用的 chipResolver
 */
export function createFileRefChipResolver(onOpenFile: (target: FileReferenceNavigationTarget) => void): ChipResolver {
  return (content) => {
    if (!content.startsWith('#')) return null;

    const parsed = parseFileReferenceToken(content);
    if (!parsed) {
      return null;
    }

    return { widget: new FileRefWidget(parsed, onOpenFile) };
  };
}
