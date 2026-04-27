/**
 * @file chipResolver.ts
 * @description 聊天输入框 Chip 解析器，将 file-ref token 解析为渲染 Widget。
 */
import { WidgetType } from '@codemirror/view';
import type { ChipResolver } from '@/components/BPromptEditor/extensions/variableChip';

/**
 * 文件引用 Chip Widget，由 chipResolver 返回。
 * 有行号 → 显示 `fileName:startLine-endLine` 或 `fileName:startLine`
 * 无行号 → 仅显示 `fileName`
 */
class FileRefWidget extends WidgetType {
  constructor(private fileName: string, private startLine: number, private endLine: number) {
    super();
  }

  eq(other: FileRefWidget): boolean {
    return this.fileName === other.fileName && this.startLine === other.startLine && this.endLine === other.endLine;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'b-prompt-chip b-prompt-chip--file';
    if (this.startLine > 0) {
      span.textContent = this.startLine === this.endLine ? `${this.fileName}:${this.startLine}` : `${this.fileName}:${this.startLine}-${this.endLine}`;
    } else {
      span.textContent = this.fileName;
    }
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Chip 解析器，将 {{...}} 内部的 body 解析为渲染指令。
 * 新格式（4 字段）: file-ref:id|fileName|startLine|endLine
 * 旧格式（3 字段）: file-ref:id|fileName|line  — 兼容降级解析
 * 其他 → null（不渲染为 chip）。
 */
export const chipResolver: ChipResolver = (body) => {
  if (!body.startsWith('file-ref:')) {
    return null;
  }

  const stripped = body.slice('file-ref:'.length);
  if (!stripped) return null;

  const parts = stripped.split('|');
  const fileName = parts[1] || parts[0];

  // 新格式（4 字段）: id|name|startLine|endLine
  if (parts.length >= 4) {
    const rawStart = parts[2] !== undefined && parts[2] !== '' ? Number(parts[2]) : NaN;
    const rawEnd = parts[3] !== undefined && parts[3] !== '' ? Number(parts[3]) : NaN;
    const startLine = Number.isNaN(rawStart) ? 0 : rawStart;
    // endLine < startLine 时为异常数据，退化为单行引用
    const endLine = Number.isNaN(rawEnd) || rawEnd < startLine ? startLine : rawEnd;
    return { widget: new FileRefWidget(fileName, startLine, endLine) };
  }

  // 旧格式降级解析（3 字段）: id|name|line，line 为 "10" 或 "10-20"
  const raw = parts[2] || '';
  const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(raw);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = rangeMatch[2] !== undefined ? Number(rangeMatch[2]) : start;
    return { widget: new FileRefWidget(fileName, start, end) };
  }

  // 格式损坏：降级为仅显示文件名
  if (import.meta.env.DEV) {
    console.warn('[chipResolver] 无法解析文件引用 token body:', body);
  }
  return { widget: new FileRefWidget(fileName, 0, 0) };
};
