/**
 * @file useVariableEncoder.ts
 * @description Prompt 编辑器变量与文件引用 chip 的序列化工具。
 */
export const CARET_SPACER = '\u00A0';
export const ZERO_WIDTH_SPACE = '\u200B';

/**
 * 文件引用 chip 数据。
 */
export interface FileReferenceChip {
  /** 完整文件路径，未保存文件为 null */
  filePath: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 行号或行号范围 */
  line: number | string;
}

export interface VariableEncoderOptions {
  /** 根据变量值获取展示名称 */
  getVariableLabel: (value: string) => string | undefined;
}

/**
 * 规范化编辑器文本，移除不会构成真实内容的占位字符。
 * @param content - 解码后的编辑器文本
 * @returns 仅用于空态判断的规范化文本
 */
export function normalizePromptEditorContent(content: string): string {
  return content.replace(new RegExp(CARET_SPACER, 'g'), '').replace(new RegExp(ZERO_WIDTH_SPACE, 'g'), '').trim();
}

/**
 * 判断当前编辑器内容是否应展示 placeholder。
 * @param content - 解码后的编辑器文本
 * @returns 是否为空内容
 */
export function isPromptEditorEffectivelyEmpty(content: string): boolean {
  return normalizePromptEditorContent(content).length === 0;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * 判断未知值是否为普通对象。
 * @param value - 待判断的值
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 从路径中推导文件名。
 * @param filePath - 完整文件路径
 */
function inferFileName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

/**
 * 将文件引用 chip 转换为稳定占位符。
 * @param reference - 文件引用数据
 */
export function serializeFileReference(reference: FileReferenceChip): string {
  return `{{file-ref:${JSON.stringify({
    path: reference.filePath,
    name: reference.fileName,
    line: String(reference.line)
  })}}}`;
}

/**
 * 解析文件引用占位符中的 JSON 数据。
 * @param payload - 占位符负载
 */
function parseFileReferencePayload(payload: string): FileReferenceChip | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed) || (typeof parsed.path !== 'string' && parsed.path !== null)) {
      return null;
    }

    const line = typeof parsed.line === 'number' || typeof parsed.line === 'string' ? String(parsed.line) : '';
    const fileName = typeof parsed.name === 'string' && parsed.name ? parsed.name : typeof parsed.path === 'string' ? inferFileName(parsed.path) : '';
    if (!line || !fileName) {
      return null;
    }

    return {
      filePath: parsed.path,
      fileName,
      line
    };
  } catch {
    return null;
  }
}

export function useVariableEncoder(options: VariableEncoderOptions) {
  const { getVariableLabel } = options;

  function createVariableSpan(variableName: string): HTMLElement {
    const element = document.createElement('span');
    element.className = 'b-prompt-editor-tag';
    element.setAttribute('data-value', 'variable');
    element.setAttribute('data-content', variableName);
    element.setAttribute('contenteditable', 'false');
    element.textContent = getVariableLabel(variableName) || variableName;
    return element;
  }

  /**
   * 创建文件引用 chip DOM。
   * @param reference - 文件引用数据
   */
  function createFileReferenceSpan(reference: FileReferenceChip): HTMLElement {
    const element = document.createElement('span');
    element.className = 'b-prompt-editor-tag b-prompt-editor-tag--file-reference';
    element.setAttribute('data-value', 'file-reference');
    element.setAttribute('data-file-name', reference.fileName);
    element.setAttribute('data-line', String(reference.line));
    if (reference.filePath) {
      element.setAttribute('data-file-path', reference.filePath);
    } else {
      element.setAttribute('data-temporary', 'true');
    }
    element.setAttribute('contenteditable', 'false');
    element.textContent = `${reference.fileName}:${reference.line}`;
    return element;
  }

  /**
   * 编码普通文本片段中的变量占位符。
   * @param content - 普通文本片段
   */
  function encodeVariableTokens(content: string): string {
    return escapeHtml(content).replace(/\{\{([^{}]+)\}\}/g, (_, name: string) => createVariableSpan(name.trim()).outerHTML);
  }

  /**
   * 将 model value 编码为 contenteditable 可渲染 HTML。
   * @param content - model value
   */
  function encodeVariables(content: string): string {
    if (!content) return '';

    const fileReferencePattern = /\{\{file-ref:(\{.*?\})\}\}/g;
    const parts: string[] = [];
    let lastIndex = 0;

    content.replace(fileReferencePattern, (match: string, payload: string, offset: number) => {
      parts.push(encodeVariableTokens(content.slice(lastIndex, offset)));
      const reference = parseFileReferencePayload(payload);
      parts.push(reference ? createFileReferenceSpan(reference).outerHTML : escapeHtml(match));
      lastIndex = offset + match.length;
      return match;
    });

    parts.push(encodeVariableTokens(content.slice(lastIndex)));
    return parts.join('');
  }

  function decodeVariables(content: string): string {
    if (!content) return '';

    const temp = document.createElement('div');
    temp.innerHTML = content.split(CARET_SPACER).join('');

    temp.querySelectorAll('span[data-value="file-reference"]').forEach((element) => {
      const filePath = element.getAttribute('data-file-path');
      const fileName = element.getAttribute('data-file-name') || (filePath ? inferFileName(filePath) : '');
      const line = element.getAttribute('data-line') ?? '';
      if (!fileName || !line) {
        element.replaceWith(document.createTextNode(element.textContent ?? ''));
        return;
      }

      element.replaceWith(document.createTextNode(serializeFileReference({ filePath, fileName, line })));
    });

    temp.querySelectorAll('span[data-value="variable"][data-content]').forEach((element) => {
      element.replaceWith(document.createTextNode(`{{${element.getAttribute('data-content') ?? ''}}}`));
    });

    temp.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    temp.querySelectorAll('div, p').forEach((block) => {
      block.parentNode?.insertBefore(document.createTextNode('\n'), block);
      while (block.firstChild) block.parentNode?.insertBefore(block.firstChild, block);
      block.remove();
    });

    return temp.textContent || '';
  }

  function isVariableElement(node: Node | null): node is HTMLElement {
    return node instanceof HTMLElement && node.dataset.value === 'variable';
  }

  /**
   * 判断节点是否为 Prompt 编辑器不可编辑 chip。
   * @param node - 待判断节点
   */
  function isChipElement(node: Node | null): node is HTMLElement {
    return node instanceof HTMLElement && (node.dataset.value === 'variable' || node.dataset.value === 'file-reference');
  }

  return {
    createVariableSpan,
    createFileReferenceSpan,
    encodeVariables,
    decodeVariables,
    isVariableElement,
    isChipElement
  };
}
