/**
 * @file richSelectionAssistant.ts
 * @description Rich 模式（Tiptap）选区工具适配器实现。
 */
import type {
  SelectionAssistantAdapter,
  SelectionAssistantCapabilities,
  SelectionAssistantContext,
  SelectionAssistantPosition,
  SelectionAssistantRange,
  SelectionReferencePayload
} from './selectionAssistant';
import type { Editor } from '@tiptap/vue-3';
import { TextSelection } from '@tiptap/pm/state';
import { clearAISelectionHighlight, setAISelectionHighlight } from '../extensions/aiRangeHighlight';
import { getSelectionSourceLineRange, getSelectionSourceLineRangeFromMarkdown } from './sourceLineMapping';

/**
 * 判断字符是否为行尾换行符。
 * @param char - 待判断字符
 * @returns 是否为换行符
 */
function isLineBreakChar(char: string): boolean {
  return char === '\n' || char === '\r';
}

/**
 * 判断 DOMRect 是否具有可见面积。
 * @param rect - 待判断矩形
 * @returns 是否为可见矩形
 */
function isVisibleDomRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/**
 * 创建 Rich 模式选区工具适配器。
 * @param editor - Tiptap Editor 实例
 * @param context - 编辑器上下文（文件元数据 + 浮层根容器）
 * @returns 遵循 SelectionAssistantAdapter 协议的适配器实例
 */
export function createRichSelectionAssistantAdapter(editor: Editor, context: SelectionAssistantContext): SelectionAssistantAdapter {
  /**
   * 将 Tiptap 的 coordsAtPos 返回坐标转换为相对 overlayRoot 的矩形。
   */
  function coordsToAnchorRect(coords: { top: number; left: number; right: number; bottom: number }): {
    top: number;
    left: number;
    width: number;
    height: number;
  } {
    const overlayRect = context.overlayRoot.getBoundingClientRect();
    return {
      top: coords.top - overlayRect.top,
      left: coords.left - overlayRect.left,
      width: coords.right - coords.left,
      height: coords.bottom - coords.top
    };
  }

  /**
   * 将 viewport 坐标系下的 DOMRect 转换为相对 overlayRoot 的矩形。
   * @param rect - viewport 坐标系矩形
   * @returns overlayRoot 坐标系矩形
   */
  function domRectToOverlayRect(rect: DOMRect): {
    top: number;
    left: number;
    width: number;
    height: number;
  } {
    const overlayRect = context.overlayRoot.getBoundingClientRect();
    return {
      top: rect.top - overlayRect.top,
      left: rect.left - overlayRect.left,
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * 归一化 rich 选区起始锚点位置。
   * ProseMirror 在全选场景下 selection.from 可能为 0，此时需要回退到第一个可定位位置。
   * @param from - 原始选区起点
   * @returns 可传给 coordsAtPos 的合法位置
   */
  function resolveToolbarAnchorPos(from: number): number {
    return Math.max(1, from);
  }

  /**
   * 将 rich 选区结束位置收敛到最后一个真实高亮字符之后。
   * 末尾空行未被视觉高亮时，不应参与工具栏和 AI 面板的底部定位。
   * @param range - 当前选区范围
   * @returns 用于底部定位的结束位置
   */
  function resolveSelectionEndAnchorPos(range: SelectionAssistantRange): number {
    let anchorPos = range.to;
    while (anchorPos > range.from) {
      const tailChar = editor.state.doc.textBetween(anchorPos - 1, anchorPos, '\0', '\0');
      if (!isLineBreakChar(tailChar)) {
        return anchorPos;
      }
      anchorPos -= 1;
    }

    return range.to;
  }

  /**
   * 计算视口在 overlayRoot 坐标系中的可见区域矩形。
   * 用于宿主组件做边界约束，确保工具栏/面板不会超出可视区域。
   * @param overlayRect - overlayRoot 的 getBoundingClientRect 结果
   * @returns 视口可见区域，overlayRoot 坐标系
   */
  function getViewportContainerRect(overlayRect: DOMRect): { top: number; left: number; width: number; height: number } {
    const viewportTop = Math.max(0, -overlayRect.top);
    const viewportLeft = Math.max(0, -overlayRect.left);
    return {
      top: viewportTop,
      left: viewportLeft,
      width: window.innerWidth - viewportLeft,
      height: window.innerHeight - viewportTop
    };
  }

  /**
   * 读取浏览器真实选区矩形。
   * 优先使用 DOM selection 的 client rects，以浏览器实际高亮区域为准，避免尾部空行或块边界扩张误导定位。
   * @returns 选区矩形；若当前环境无法读取则返回 null
   */
  function getDomSelectionRect(): { top: number; left: number; width: number; height: number } | null {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      return null;
    }

    const range = domSelection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter(isVisibleDomRect);
    if (clientRects.length === 0) {
      const fallbackRect = range.getBoundingClientRect();
      if (!isVisibleDomRect(fallbackRect)) {
        return null;
      }
      return domRectToOverlayRect(fallbackRect);
    }

    const top = Math.min(...clientRects.map((rect) => rect.top));
    const left = Math.min(...clientRects.map((rect) => rect.left));
    const right = Math.max(...clientRects.map((rect) => rect.right));
    const bottom = Math.max(...clientRects.map((rect) => rect.bottom));

    return domRectToOverlayRect(new DOMRect(left, top, right - left, bottom - top));
  }

  /**
   * 读取 AI 高亮装饰的真实矩形。
   * rich 模式的视觉高亮以 `.ai-selection-highlight` 为准，因此工具栏下方定位应优先跟随这些真实 DOM 片段。
   * @returns 高亮矩形；若当前未渲染高亮装饰则返回 null
   */
  function getHighlightDecorationRect(): { top: number; left: number; width: number; height: number } | null {
    const highlightElements = Array.from(editor.view.dom.querySelectorAll<HTMLElement>('.ai-selection-highlight'));
    const highlightRects = highlightElements.map((element) => element.getBoundingClientRect()).filter(isVisibleDomRect);
    if (highlightRects.length === 0) {
      return null;
    }

    const top = Math.min(...highlightRects.map((rect) => rect.top));
    const left = Math.min(...highlightRects.map((rect) => rect.left));
    const right = Math.max(...highlightRects.map((rect) => rect.right));
    const bottom = Math.max(...highlightRects.map((rect) => rect.bottom));

    return domRectToOverlayRect(new DOMRect(left, top, right - left, bottom - top));
  }

  return {
    getCapabilities(): SelectionAssistantCapabilities {
      return {
        actions: {
          ai: true,
          reference: true,
          bold: true,
          italic: true,
          underline: true,
          strike: true,
          code: true
        }
      };
    },

    isEditable(): boolean {
      return editor.isEditable;
    },

    getSelection(): SelectionAssistantRange | null {
      const { selection } = editor.state;
      if (selection.empty) return null;

      // 仅对文本选区显示格式工具栏，过滤表格单元格选区与节点选区
      if (!(selection instanceof TextSelection)) {
        return null;
      }

      return {
        from: selection.from,
        to: selection.to,
        text: editor.state.doc.textBetween(selection.from, selection.to, ''),
        docVersion: editor.state.doc.nodeSize
      };
    },

    restoreSelection(range: SelectionAssistantRange): void {
      const { state, view } = editor;
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)));
    },

    isRangeStillValid(range: SelectionAssistantRange): boolean {
      const currentDocVersion = editor.state.doc.nodeSize;
      if (range.docVersion !== undefined && range.docVersion !== currentDocVersion) {
        return false;
      }

      const currentText = editor.state.doc.textBetween(range.from, range.to, '');
      return currentText === range.text;
    },

    clearNativeSelection(): void {
      // rich 模式通过 CSS ::selection { background: transparent } 隐藏原生选区
      // 无需额外操作
    },

    getPanelPosition(range: SelectionAssistantRange): SelectionAssistantPosition | null {
      const endCoords = editor.view.coordsAtPos(resolveSelectionEndAnchorPos(range), -1);
      const lineHeight = endCoords.bottom - endCoords.top;
      const overlayRect = context.overlayRoot.getBoundingClientRect();
      return {
        anchorRect: coordsToAnchorRect(endCoords),
        lineHeight,
        containerRect: getViewportContainerRect(overlayRect)
      };
    },

    getToolbarPosition(range: SelectionAssistantRange): SelectionAssistantPosition | null {
      const startCoords = editor.view.coordsAtPos(resolveToolbarAnchorPos(range.from));
      const endCoords = editor.view.coordsAtPos(resolveSelectionEndAnchorPos(range), -1);
      const lineHeight = startCoords.bottom - startCoords.top;
      const overlayRect = context.overlayRoot.getBoundingClientRect();
      const fallbackSelectionRect = {
        top: Math.min(startCoords.top, endCoords.top) - overlayRect.top,
        left: Math.min(startCoords.left, endCoords.left) - overlayRect.left,
        width: Math.max(startCoords.right, endCoords.right) - Math.min(startCoords.left, endCoords.left),
        height: Math.max(startCoords.bottom, endCoords.bottom) - Math.min(startCoords.top, endCoords.top)
      };
      return {
        anchorRect: coordsToAnchorRect(startCoords),
        selectionRect: getHighlightDecorationRect() ?? getDomSelectionRect() ?? fallbackSelectionRect,
        lineHeight,
        containerRect: getViewportContainerRect(overlayRect)
      };
    },

    showSelectionHighlight(range: SelectionAssistantRange): void {
      setAISelectionHighlight(editor, { from: range.from, to: range.to });
    },

    clearSelectionHighlight(): void {
      clearAISelectionHighlight(editor);
    },

    /**
     * 应用 AI 生成内容到原选区位置。
     * 先恢复选中的文本范围，再用 Markdown 格式的内容替换。
     * @param range - 原选区范围
     * @param content - AI 生成的新内容
     */
    async applyGeneratedContent(range: SelectionAssistantRange, content: string): Promise<void> {
      this.restoreSelection(range);
      editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, content).run();
    },

    /**
     * 构造文件引用载荷，计算源码行号与渲染行号。
     * 优先使用基于 Markdown 原文的精确行号映射，回退到基于 ProseMirror node attr 的方案。
     * @param range - 当前选区范围
     * @returns 文件引用载荷，无法构造时返回 null
     */
    buildSelectionReference(range: SelectionAssistantRange): SelectionReferencePayload | null {
      const { editorState } = context;

      // 优先使用基于 Markdown lexer 的精确行号，回退到基于 attrs 的方案
      const sourceLineRange =
        getSelectionSourceLineRangeFromMarkdown(editor.state.doc, range.from, range.to, editorState.content || '') ||
        getSelectionSourceLineRange(editor.state.doc, range.from, range.to);

      // 计算渲染行号（基于 ProseMirror 文档文本的换行符计数）
      const textBeforeStart = editor.state.doc.textBetween(0, range.from, '\n', '\n');
      const textBeforeEnd = editor.state.doc.textBetween(0, range.to, '\n', '\n');
      const renderStartLine = textBeforeStart.split(/\r?\n/).length;
      const renderEndLine = textBeforeEnd.split(/\r?\n/).length;

      const { id = '', ext = '', path: filePath, name: fileName } = editorState;
      const { startLine = 0, endLine = 0 } = sourceLineRange || {};

      return {
        id,
        ext,
        filePath: filePath || '',
        fileName,
        startLine,
        endLine,
        renderStartLine,
        renderEndLine
      };
    },

    /**
     * 绑定编辑器选区、焦点、失焦事件。
     * Tiptap 的 blur 事件回调签名为 ({ event }: { event: FocusEvent }) => void，
     * 通过包装函数适配到 adapter 协议的 onBlur(event?) 签名。
     * @param handlers - 事件处理器集合
     * @returns 解绑函数
     */
    bindSelectionEvents(handlers): () => void {
      editor.on('selectionUpdate', handlers.onSelectionChange);
      editor.on('focus', handlers.onFocus);
      const onTiptapBlur = ({ event }: { event: FocusEvent }) => handlers.onBlur(event);
      editor.on('blur', onTiptapBlur);
      const editorDom = editor.view.dom;
      const handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          handlers.onEscape?.();
        }
      };
      editorDom.addEventListener('keydown', handleKeydown);

      return () => {
        editor.off('selectionUpdate', handlers.onSelectionChange);
        editor.off('focus', handlers.onFocus);
        editor.off('blur', onTiptapBlur);
        editorDom.removeEventListener('keydown', handleKeydown);
      };
    }
  };
}
