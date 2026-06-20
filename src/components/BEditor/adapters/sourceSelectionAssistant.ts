/**
 * @file sourceSelectionAssistant.ts
 * @description Source 模式（CodeMirror）选区工具适配器实现。
 */
import type {
  SelectionAssistantAdapter,
  SelectionAssistantCapabilities,
  SelectionAssistantContext,
  SelectionAssistantPosition,
  SelectionAssistantRange,
  SelectionReferencePayload
} from './selectionAssistant';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { EditorSelection, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView as EditorViewRef } from '@codemirror/view';
import { nanoid } from 'nanoid';
import { restoreSourceEditorSelectionDraw, suppressSourceEditorSelectionDraw } from './sourceEditorDrawSelection';

/**
 * 源码模式高亮 decoration 的 CSS class。
 */
const HIGHLIGHT_CLASS = 'b-markdown-source__ai-highlight';

/**
 * 高亮范围状态字段。
 * 通过 StateEffect 更新，被 decorations compute 消费以渲染高亮。
 */
const highlightRangeEffect = StateEffect.define<SelectionAssistantRange | null>();

const highlightRangeField = StateField.define<SelectionAssistantRange | null>({
  create(): SelectionAssistantRange | null {
    return null;
  },
  update(value, tr): SelectionAssistantRange | null {
    for (const effect of tr.effects) {
      if (effect.is(highlightRangeEffect)) {
        return effect.value;
      }
    }
    return value;
  }
});

/**
 * 获取指定位置所在行的像素高度。
 * @param view - CodeMirror EditorView 实例
 * @param pos - 文档位置
 * @returns 该行的像素高度
 */
function getLineHeight(view: EditorView, pos: number): number {
  const lineBlock = view.lineBlockAt(pos);
  return lineBlock.bottom - lineBlock.top;
}

/**
 * 获取文档的 docVersion（以文本长度作为版本标识）。
 * @param view - CodeMirror EditorView 实例
 * @returns 当前文档长度
 */
function getDocVersion(view: EditorView): number {
  return view.state.doc.length;
}

/**
 * 判断字符是否为行尾换行符。
 * @param char - 待判断字符
 * @returns 是否为换行符
 */
function isLineBreakChar(char: string): boolean {
  return char === '\n' || char === '\r';
}

/**
 * 将选区结束位置收敛到最后一个真实高亮字符之后，避免尾部空行影响工具栏/面板的底部定位。
 * CodeMirror 在选择若干结尾空行时，视觉高亮通常不会覆盖这些空行，因此下方回退也应基于最后一个可见高亮字符。
 * @param view - CodeMirror EditorView 实例
 * @param range - 当前选区范围
 * @returns 用于定位的结束位置
 */
function resolveSelectionEndAnchorPos(view: EditorView, range: SelectionAssistantRange): number {
  let anchorPos = range.to;
  while (anchorPos > range.from) {
    const tailChar = view.state.doc.sliceString(anchorPos - 1, anchorPos);
    if (!isLineBreakChar(tailChar)) {
      return anchorPos;
    }
    anchorPos -= 1;
  }

  return range.to;
}

/**
 * 判断当前选区是否覆盖整个源码文档。
 * @param view - CodeMirror EditorView 实例
 * @param range - 当前选区范围
 * @returns 是否为全选
 */
/**
 * 创建 Source 模式选区工具适配器。
 * @param view - CodeMirror EditorView 实例
 * @param context - 编辑器上下文（文件元数据 + 浮层根容器）
 * @param editableGetter - 获取可编辑状态的 getter
 * @returns 遵循 SelectionAssistantAdapter 协议的适配器实例
 */
export function createSourceSelectionAssistantAdapter(
  view: EditorView,
  context: SelectionAssistantContext,
  editableGetter: () => boolean
): SelectionAssistantAdapter {
  return {
    getCapabilities(): SelectionAssistantCapabilities {
      return {
        actions: {
          ai: true,
          reference: true,
          comment: true,
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          code: false
        }
      };
    },

    isEditable(): boolean {
      return editableGetter();
    },

    getSelection(): SelectionAssistantRange | null {
      const selection = view.state.selection.main;
      if (selection.from === selection.to) {
        return null;
      }

      return {
        from: selection.from,
        to: selection.to,
        text: view.state.sliceDoc(selection.from, selection.to),
        docVersion: getDocVersion(view)
      };
    },

    restoreSelection(range: SelectionAssistantRange): void {
      view.dispatch({
        selection: EditorSelection.range(range.from, range.to)
      });
    },

    isRangeStillValid(range: SelectionAssistantRange): boolean {
      const currentDocVersion = getDocVersion(view);
      if (range.docVersion !== undefined && range.docVersion !== currentDocVersion) {
        return false;
      }

      return view.state.sliceDoc(range.from, range.to) === range.text;
    },

    clearNativeSelection(): void {
      suppressSourceEditorSelectionDraw(view);
    },

    getPanelPosition(range: SelectionAssistantRange): SelectionAssistantPosition | null {
      const overlayRect = context.overlayRoot.getBoundingClientRect();

      // 若选区末尾落在空行上，向前找到最后一个非空行作为面板锚点。
      const anchorPos = resolveSelectionEndAnchorPos(view, range);

      const endCoords = view.coordsAtPos(anchorPos);
      if (!endCoords) {
        return null;
      }

      const lineHeight = getLineHeight(view, anchorPos);
      // 计算视口在 overlayRoot 坐标系中的可见区域，用于宿主做边界约束
      const viewportTop = Math.max(0, -overlayRect.top);
      const viewportLeft = Math.max(0, -overlayRect.left);
      return {
        anchorRect: {
          top: endCoords.top - overlayRect.top,
          left: endCoords.left - overlayRect.left,
          width: endCoords.right - endCoords.left,
          height: endCoords.bottom - endCoords.top
        },
        lineHeight,
        containerRect: {
          top: viewportTop,
          left: viewportLeft,
          width: window.innerWidth - viewportLeft,
          height: window.innerHeight - viewportTop
        }
      };
    },

    getToolbarPosition(range: SelectionAssistantRange): SelectionAssistantPosition | null {
      const overlayRect = context.overlayRoot.getBoundingClientRect();

      // 跳过选区起始的空行，找到第一个非空行作为工具栏锚点。
      let anchorPos = range.from;
      const fromLine = view.state.doc.lineAt(anchorPos);
      if (fromLine.length === 0) {
        let line = fromLine;
        while (line.length === 0 && line.to < range.to) {
          anchorPos = line.to + 1;
          if (anchorPos >= range.to) {
            anchorPos = range.to;
            break;
          }
          line = view.state.doc.lineAt(anchorPos);
        }
      }

      const startCoords = view.coordsAtPos(anchorPos);
      if (!startCoords) {
        return null;
      }

      const selectionEndCoords = view.coordsAtPos(resolveSelectionEndAnchorPos(view, range), -1);
      if (!selectionEndCoords) {
        return null;
      }

      const lineHeight = getLineHeight(view, anchorPos);
      // 计算视口在 overlayRoot 坐标系中的可见区域，用于宿主做边界约束
      const viewportTop = Math.max(0, -overlayRect.top);
      const viewportLeft = Math.max(0, -overlayRect.left);
      const selectionTop = Math.min(startCoords.top, selectionEndCoords.top);
      const selectionBottom = Math.max(startCoords.bottom, selectionEndCoords.bottom);
      const selectionLeft = Math.min(startCoords.left, selectionEndCoords.left);
      const selectionRight = Math.max(startCoords.right, selectionEndCoords.right);

      return {
        anchorRect: {
          top: startCoords.top - overlayRect.top,
          left: startCoords.left - overlayRect.left,
          width: startCoords.right - startCoords.left,
          height: startCoords.bottom - startCoords.top
        },
        selectionRect: {
          top: selectionTop - overlayRect.top,
          left: selectionLeft - overlayRect.left,
          width: selectionRight - selectionLeft,
          height: selectionBottom - selectionTop
        },
        lineHeight,
        containerRect: {
          top: viewportTop,
          left: viewportLeft,
          width: window.innerWidth - viewportLeft,
          height: window.innerHeight - viewportTop
        }
      };
    },

    showSelectionHighlight(range: SelectionAssistantRange): void {
      view.dispatch({
        effects: highlightRangeEffect.of({ ...range })
      });
    },

    clearSelectionHighlight(): void {
      view.dispatch({
        effects: highlightRangeEffect.of(null)
      });
      restoreSourceEditorSelectionDraw(view);
    },

    /**
     * 应用 AI 生成内容到原选区位置。
     * @param range - 原选区范围
     * @param content - AI 生成的新内容
     */
    async applyGeneratedContent(range: SelectionAssistantRange, content: string): Promise<void> {
      const nextPosition = range.from + content.length;
      view.dispatch({
        changes: {
          from: range.from,
          to: range.to,
          insert: content
        },
        selection: EditorSelection.cursor(nextPosition),
        scrollIntoView: true
      });
      view.focus();
    },

    /**
     * 应用行内批注，将选中文本包裹为 `[text]{comment="..."}` 语法。
     * @param range - 当前选区范围
     * @param comment - 批注正文
     */
    applyComment(range: SelectionAssistantRange, comment: string): void {
      const selectedText = view.state.sliceDoc(range.from, range.to);
      const id = nanoid();
      const wrapped = `[${selectedText}]{comment="${comment}" id="${id}"}`;
      const nextPosition = range.from + wrapped.length;
      view.dispatch({
        changes: {
          from: range.from,
          to: range.to,
          insert: wrapped
        },
        selection: EditorSelection.cursor(nextPosition),
        scrollIntoView: true
      });
      view.focus();
    },

    /**
     * 构造文件引用载荷。
     * 基于源码文本直接计算行号。
     * @param range - 当前选区范围
     * @returns 文件引用载荷
     */
    buildSelectionReference(range: SelectionAssistantRange): SelectionReferencePayload {
      const { editorState } = context;
      const { id = '', ext = '', path: filePath, name: fileName } = editorState;

      // 基于完整源码文本计算 1-based 行号
      const fullText = view.state.doc.toString();
      const textBeforeStart = fullText.slice(0, range.from);
      const textBeforeEnd = fullText.slice(0, range.to);
      const startLine = textBeforeStart.split(/\r?\n/).length;
      const endLine = textBeforeEnd.split(/\r?\n/).length;

      return {
        id,
        ext,
        filePath: filePath || '',
        fileName,
        startLine,
        endLine
      };
    },

    /**
     * 绑定编辑器选区、焦点、失焦事件。
     * 选区变化通过 DOM 事件（mouseup/keyup）检测，失焦/焦点通过 CodeMirror DOM 事件。
     * @param handlers - 事件处理器集合
     * @returns 解绑函数
     */
    bindSelectionEvents(handlers): () => void {
      const { dom } = view;
      let pointerSelecting = false;

      const handleSelectionChange = (): void => {
        handlers.onSelectionChange();
      };
      const handlePointerDown = (event: PointerEvent): void => {
        pointerSelecting = true;
        handlers.onPointerSelectionStart?.(event);
        handlers.onPointerDownInsideEditor?.(event);
      };
      const handleDocumentPointerMove = (event: PointerEvent): void => {
        if (!pointerSelecting) {
          return;
        }

        if ((event.buttons & 1) !== 1) {
          pointerSelecting = false;
          return;
        }

        handlers.onSelectionChange();
      };
      const handleDocumentPointerUp = (event: PointerEvent): void => {
        if (pointerSelecting) {
          handlers.onPointerSelectionEnd?.(event);
        }
        pointerSelecting = false;
      };
      const handleDocumentPointerDown = (event: PointerEvent): void => {
        if (!dom.contains(event.target as Node | null)) {
          pointerSelecting = false;
          handlers.onPointerDownOutsideEditor?.(event);
        }
      };
      const handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          handlers.onEscape?.();
        }
      };

      dom.addEventListener('mouseup', handleSelectionChange);
      dom.addEventListener('keyup', handleSelectionChange);
      dom.addEventListener('pointerdown', handlePointerDown);
      dom.addEventListener('keydown', handleKeydown);
      dom.addEventListener('focus', handlers.onFocus);
      dom.addEventListener('blur', handlers.onBlur as EventListener);
      document.addEventListener('pointermove', handleDocumentPointerMove, true);
      document.addEventListener('pointerup', handleDocumentPointerUp, true);
      document.addEventListener('pointerdown', handleDocumentPointerDown, true);

      return () => {
        dom.removeEventListener('mouseup', handleSelectionChange);
        dom.removeEventListener('keyup', handleSelectionChange);
        dom.removeEventListener('pointerdown', handlePointerDown);
        dom.removeEventListener('keydown', handleKeydown);
        dom.removeEventListener('focus', handlers.onFocus);
        dom.removeEventListener('blur', handlers.onBlur as EventListener);
        document.removeEventListener('pointermove', handleDocumentPointerMove, true);
        document.removeEventListener('pointerup', handleDocumentPointerUp, true);
        document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      };
    },

    dispose(): void {
      this.clearSelectionHighlight();
    }
  };
}

/**
 * 创建 Source 模式高亮 decoration 扩展。
 * 用于在 CodeMirror 中渲染选区高亮视觉效果，与 rich 模式的 AISelectionHighlight 语义对等。
 * @returns CodeMirror Extension，包含高亮状态字段与装饰层
 */
export function createSourceSelectionHighlightExtension(): Extension {
  return [
    highlightRangeField,
    EditorViewRef.decorations.compute(['doc', highlightRangeField], (state) => {
      const range = state.field(highlightRangeField);
      if (!range || range.from === range.to) {
        return Decoration.none;
      }
      return Decoration.set([
        Decoration.mark({
          class: HIGHLIGHT_CLASS
        }).range(range.from, range.to)
      ]);
    })
  ];
}
