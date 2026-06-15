/**
 * @file useTextEditing.ts
 * @description BDrawing 文本节点编辑状态与 textarea 交互。
 */
import type { DrawingConnectorElement, DrawingElement, DrawingPoint, DrawingShapeElement, DrawingSize } from '../types';
import type { UseDrawingBoardReturn } from './useDrawingBoard';
import type { UseDrawingInteractionReturn } from './useDrawingInteraction';
import type { UseDrawingViewportReturn } from './useDrawingViewport';
import { computed, nextTick, ref } from 'vue';
import type { CSSProperties, Ref } from 'vue';
import {
  DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_SIZE,
  DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_WEIGHT,
  DRAWING_CONNECTOR_LABEL_EDITOR_MIN_WIDTH,
  DRAWING_TEXT_DEFAULT_FONT_SIZE,
  DRAWING_TEXT_DEFAULT_FONT_WEIGHT,
  DRAWING_TEXT_EDITOR_VIEWPORT_MARGIN,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_RATIO,
  DRAWING_TEXT_VERTICAL_PADDING,
  measureDrawingTextElementSize
} from '../utils/boardTransforms';
import {
  findDrawingShapeElement,
  getDrawingConnectorAnchorPoint,
  getDrawingLineLabelPosition,
  getDrawingShapeRenderSize,
  isDrawingConnectorElement
} from '../utils/drawingGeometry';
import { wrapDrawingTextLineItems } from '../utils/drawingTextMetrics';

/**
 * 文本编辑目标类型。
 */
type TextEditingTargetKind = 'shape' | 'connector';

/**
 * 文本节点编辑会话。
 */
export interface TextEditingSession {
  /** 正在编辑的元素 ID */
  id: string;
  /** 正在编辑的目标类型 */
  kind: TextEditingTargetKind;
  /** 进入编辑前的原始文本 */
  originalText: string;
  /** 是否为刚创建的文本节点 */
  isNew: boolean;
}

/**
 * 文本编辑 hook 入参。
 */
export interface UseTextEditingOptions {
  /** 画板状态与命令 */
  board: UseDrawingBoardReturn;
  /** 视口命令 */
  viewport: UseDrawingViewportReturn;
  /** 选择和删除交互 */
  interaction: UseDrawingInteractionReturn;
  /** 画板根节点 */
  rootRef: Ref<HTMLElement | null>;
  /** 当前画布视口实际渲染尺寸 */
  viewportSize: Ref<DrawingSize>;
}

/**
 * 文本编辑 hook 返回值。
 */
export interface UseTextEditingReturn {
  /** 当前文本编辑会话 */
  textEditingSession: Ref<TextEditingSession | null>;
  /** 文本编辑输入值 */
  textEditorValue: Ref<string>;
  /** 当前编辑中的形状预览尺寸 */
  textEditingPreviewSize: Ref<DrawingSize | null>;
  /** 文本编辑器 DOM */
  textEditorRef: Ref<HTMLTextAreaElement | null>;
  /** 文本编辑框定位样式 */
  textEditorStyle: Ref<CSSProperties>;
  /** 设置文本编辑器 DOM */
  setTextEditorRef: (editor: HTMLTextAreaElement | null) => void;
  /** 开始编辑文本节点 */
  startTextEditing: (element: DrawingShapeElement, isNew: boolean) => Promise<void>;
  /** 开始编辑连接线标签 */
  startConnectorLabelEditing: (element: DrawingConnectorElement) => Promise<void>;
  /** 提交文本编辑内容 */
  commitTextEditor: () => void;
  /** 取消文本编辑 */
  cancelTextEditor: () => void;
  /** 处理文本编辑器输入 */
  handleTextEditorInput: (event: Event) => void;
  /** 处理文本编辑框快捷键 */
  handleTextEditorKeydown: (event: KeyboardEvent) => void;
}

/**
 * 创建文本编辑 hook。
 * @param options - 文本编辑配置
 * @returns 文本编辑状态和事件处理器
 */
export function useTextEditing(options: UseTextEditingOptions): UseTextEditingReturn {
  const textEditingSession = ref<TextEditingSession | null>(null);
  const textEditorValue = ref<string>('');
  const textEditorRef = ref<HTMLTextAreaElement | null>(null);

  /**
   * 读取当前编辑的连接线元素。
   * @param id - 连接线 ID
   * @returns 连接线元素
   */
  function findConnectorElement(id: string): DrawingConnectorElement | null {
    const element = options.board.state.value.elements.find((item: DrawingElement): boolean => item.id === id);

    return element && isDrawingConnectorElement(element) ? element : null;
  }

  /**
   * 将画板坐标转换为浏览器固定定位坐标。
   * @param point - 画板坐标
   * @returns 浏览器坐标
   */
  function projectBoardPointToClient(point: DrawingPoint): DrawingPoint {
    const { center, zoom } = options.board.state.value.viewport;
    const rootRect = options.rootRef.value?.getBoundingClientRect();

    return {
      x: (rootRect?.left ?? 0) + options.viewportSize.value.width / 2 + (point.x - center.x) * zoom,
      y: (rootRect?.top ?? 0) + options.viewportSize.value.height / 2 + (point.y - center.y) * zoom
    };
  }

  /**
   * 读取普通形状文本编辑框在形状内的顶部偏移。
   * @param element - 形状元素
   * @param shapeHeight - 形状高度
   * @param editorHeight - 编辑框高度
   * @returns 顶部偏移
   */
  function getShapeTextEditorTopOffset(element: DrawingShapeElement, shapeHeight: number, editorHeight: number): number {
    if (element.shape === 'text') {
      return 0;
    }
    if (element.style?.textVerticalAlign === 'top') {
      return 0;
    }
    if (element.style?.textVerticalAlign === 'bottom') {
      return Math.max(0, shapeHeight - editorHeight);
    }

    return Math.max(0, (shapeHeight - editorHeight) / 2);
  }

  /**
   * 创建与 SVG 文本测量一致的编辑器内边距。
   * @param zoom - 画布缩放比例
   * @returns textarea padding 样式值
   */
  function createTextEditorPadding(zoom: number): string {
    return `${(DRAWING_TEXT_VERTICAL_PADDING * zoom) / 2}px ${(DRAWING_TEXT_HORIZONTAL_PADDING * zoom) / 2}px`;
  }

  /**
   * 计算编辑中的形状预览尺寸。
   * @param element - 正在编辑的形状元素
   * @returns 预览尺寸
   */
  function createShapeTextEditingPreviewSize(element: DrawingShapeElement): DrawingSize {
    if (element.shape === 'text') {
      return measureDrawingTextElementSize(textEditorValue.value || element.text, element.style);
    }

    const fontSize = element.style?.fontSize ?? DRAWING_TEXT_DEFAULT_FONT_SIZE;
    const lineHeight = fontSize * DRAWING_TEXT_LINE_HEIGHT_RATIO;
    const text = textEditorValue.value || element.text;
    const lineCount = wrapDrawingTextLineItems(text, element.size.width, element.style).length;
    const requiredHeight = lineCount * lineHeight + DRAWING_TEXT_VERTICAL_PADDING;

    return {
      width: element.size.width,
      height: Math.max(element.size.height, Number(requiredHeight.toFixed(2)))
    };
  }

  /**
   * 创建形状文本编辑框样式。
   * @param element - 形状元素
   * @returns 编辑框样式
   */
  function createShapeTextEditorStyle(element: DrawingShapeElement): CSSProperties {
    const { zoom } = options.board.state.value.viewport;
    const isStandaloneText = element.shape === 'text';
    const fontSize = element.style?.fontSize ?? DRAWING_TEXT_DEFAULT_FONT_SIZE;
    const fontWeight = element.style?.fontWeight ?? DRAWING_TEXT_DEFAULT_FONT_WEIGHT;
    const lineHeight = fontSize * DRAWING_TEXT_LINE_HEIGHT_RATIO;
    const renderSize = isStandaloneText
      ? measureDrawingTextElementSize(textEditorValue.value || element.text, element.style)
      : getDrawingShapeRenderSize(element);
    const editorHeight = isStandaloneText
      ? renderSize.height
      : wrapDrawingTextLineItems(textEditorValue.value || element.text, renderSize.width, element.style).length * lineHeight + DRAWING_TEXT_VERTICAL_PADDING;
    const editorTopOffset = getShapeTextEditorTopOffset(element, renderSize.height, editorHeight);
    const position = projectBoardPointToClient({
      x: element.position.x,
      y: element.position.y + editorTopOffset
    });

    return {
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      fontSize: `${fontSize * zoom}px`,
      fontWeight: String(fontWeight),
      height: `${editorHeight * zoom}px`,
      left: `${position.x}px`,
      lineHeight: `${lineHeight * zoom}px`,
      overflowWrap: isStandaloneText ? undefined : 'anywhere',
      padding: createTextEditorPadding(zoom),
      position: 'fixed',
      textAlign: element.style?.textAlign ?? 'center',
      top: `${position.y}px`,
      whiteSpace: isStandaloneText ? 'pre' : 'pre-wrap',
      wordBreak: isStandaloneText ? undefined : 'break-word',
      width: `${renderSize.width * zoom}px`
    };
  }

  /**
   * 读取连接线标签中心点。
   * @param connector - 连接线元素
   * @returns 标签中心点
   */
  function getConnectorLabelCenter(connector: DrawingConnectorElement): DrawingPoint | null {
    const source = findDrawingShapeElement(options.board.state.value.elements, connector.source.elementId);
    const target = findDrawingShapeElement(options.board.state.value.elements, connector.target.elementId);
    if (!source || !target) {
      return null;
    }

    return getDrawingLineLabelPosition(
      getDrawingConnectorAnchorPoint(source, connector.source.anchor),
      getDrawingConnectorAnchorPoint(target, connector.target.anchor)
    );
  }

  /**
   * 创建连线标签编辑框样式。
   * @param connector - 连接线元素
   * @returns 编辑框样式
   */
  function createConnectorLabelEditorStyle(connector: DrawingConnectorElement): CSSProperties {
    const { zoom } = options.board.state.value.viewport;
    const fontSize = connector.style?.fontSize ?? DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_SIZE;
    const fontWeight = connector.style?.fontWeight ?? DRAWING_CONNECTOR_LABEL_DEFAULT_FONT_WEIGHT;
    const lineHeight = fontSize * DRAWING_TEXT_LINE_HEIGHT_RATIO;
    const size = measureDrawingTextElementSize(textEditorValue.value || connector.label || '', {
      fontSize,
      fontWeight
    });
    const width = Math.max(size.width, DRAWING_CONNECTOR_LABEL_EDITOR_MIN_WIDTH);
    const center = getConnectorLabelCenter(connector) ?? { x: 0, y: 0 };
    const position = projectBoardPointToClient({
      x: center.x - width / 2,
      y: center.y - size.height / 2
    });

    return {
      background: 'var(--bg-primary)',
      border: '1px solid var(--color-primary)',
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
      fontSize: `${fontSize * zoom}px`,
      fontWeight: String(fontWeight),
      height: `${size.height * zoom}px`,
      left: `${position.x}px`,
      lineHeight: `${lineHeight * zoom}px`,
      padding: createTextEditorPadding(zoom),
      position: 'fixed',
      textAlign: 'center',
      top: `${position.y}px`,
      whiteSpace: 'pre',
      width: `${width * zoom}px`
    };
  }

  /** 文本编辑框定位样式。 */
  const textEditorStyle = computed<CSSProperties>(() => {
    const session = textEditingSession.value;
    if (!session) {
      return {};
    }

    if (session.kind === 'connector') {
      const connector = findConnectorElement(session.id);

      return connector ? createConnectorLabelEditorStyle(connector) : {};
    }

    const element = findDrawingShapeElement(options.board.state.value.elements, session.id);

    return element ? createShapeTextEditorStyle(element) : {};
  });

  /** 当前编辑中的形状预览尺寸。 */
  const textEditingPreviewSize = computed<DrawingSize | null>(() => {
    const session = textEditingSession.value;
    if (!session || session.kind !== 'shape') {
      return null;
    }

    const element = findDrawingShapeElement(options.board.state.value.elements, session.id);

    return element ? createShapeTextEditingPreviewSize(element) : null;
  });

  /**
   * 结束当前文本编辑会话。
   */
  function clearTextEditing(): void {
    textEditingSession.value = null;
    textEditorValue.value = '';
  }

  /**
   * 同步文本编辑器 DOM 内容。
   */
  function syncTextEditorContent(): void {
    const editor = textEditorRef.value;
    if (!editor || editor.value === textEditorValue.value) {
      return;
    }

    editor.value = textEditorValue.value;
  }

  /**
   * 设置文本编辑器 DOM。
   * @param editor - 文本编辑器 DOM
   */
  function setTextEditorRef(editor: HTMLTextAreaElement | null): void {
    textEditorRef.value = editor;
    syncTextEditorContent();
  }

  /**
   * 选中文本编辑器内的全部内容。
   */
  function selectTextEditorContent(): void {
    const editor = textEditorRef.value;
    if (!editor) {
      return;
    }

    editor.select();
  }

  /**
   * 确保文本编辑器保持在画板可视区域内。
   */
  function keepTextEditorInViewport(): void {
    const session = textEditingSession.value;
    const rootRect = options.rootRef.value?.getBoundingClientRect();
    if (!session || !rootRect?.width || !rootRect.height) {
      return;
    }

    const { center, zoom } = options.board.state.value.viewport;
    const style = textEditorStyle.value;
    const editorLeft = Number(String(style.left ?? '0').replace('px', ''));
    const editorTop = Number(String(style.top ?? '0').replace('px', ''));
    const editorWidth = Number(String(style.width ?? '0').replace('px', ''));
    const editorHeight = Number(String(style.height ?? '0').replace('px', ''));
    if (!editorWidth || !editorHeight) {
      return;
    }

    const editorRight = editorLeft + editorWidth;
    const editorBottom = editorTop + editorHeight;
    const minLeft = rootRect.left + DRAWING_TEXT_EDITOR_VIEWPORT_MARGIN;
    const maxRight = rootRect.right - DRAWING_TEXT_EDITOR_VIEWPORT_MARGIN;
    const minTop = rootRect.top + DRAWING_TEXT_EDITOR_VIEWPORT_MARGIN;
    const maxBottom = rootRect.bottom - DRAWING_TEXT_EDITOR_VIEWPORT_MARGIN;
    let nextCenterX = center.x;
    let nextCenterY = center.y;

    if (editorLeft < minLeft) {
      nextCenterX += (editorLeft - minLeft) / zoom;
    }
    if (editorRight > maxRight) {
      nextCenterX += (editorRight - maxRight) / zoom;
    }
    if (editorTop < minTop) {
      nextCenterY += (editorTop - minTop) / zoom;
    }
    if (editorBottom > maxBottom) {
      nextCenterY += (editorBottom - maxBottom) / zoom;
    }

    if (nextCenterX === center.x && nextCenterY === center.y) {
      return;
    }

    options.viewport.setCenter({
      x: Number(nextCenterX.toFixed(2)),
      y: Number(nextCenterY.toFixed(2))
    });
  }

  /**
   * 在下一轮 DOM 更新后修正文本编辑器可见区域。
   */
  function scheduleTextEditorViewportKeepAlive(): void {
    nextTick()
      .then((): void => {
        keepTextEditorInViewport();
      })
      .catch((error: unknown): void => {
        console.warn('BDrawing text editor viewport sync failed', error);
      });
  }

  /**
   * 开始编辑文本节点。
   * @param element - 文本元素
   * @param isNew - 是否为刚创建的元素
   */
  async function startTextEditing(element: DrawingShapeElement, isNew: boolean): Promise<void> {
    textEditingSession.value = {
      id: element.id,
      kind: 'shape',
      originalText: element.text,
      isNew
    };
    textEditorValue.value = element.text;
    await nextTick();
    syncTextEditorContent();
    textEditorRef.value?.focus();
    selectTextEditorContent();
    scheduleTextEditorViewportKeepAlive();
  }

  /**
   * 开始编辑连接线标签。
   * @param element - 连接线元素
   */
  async function startConnectorLabelEditing(element: DrawingConnectorElement): Promise<void> {
    textEditingSession.value = {
      id: element.id,
      kind: 'connector',
      originalText: element.label ?? '',
      isNew: false
    };
    textEditorValue.value = element.label ?? '';
    await nextTick();
    syncTextEditorContent();
    textEditorRef.value?.focus();
    selectTextEditorContent();
    scheduleTextEditorViewportKeepAlive();
  }

  /**
   * 在当前编辑光标处插入纯文本。
   * @param text - 要插入的文本
   */
  function insertTextEditorPlainText(text: string): void {
    const editor = textEditorRef.value;
    if (!editor) {
      return;
    }

    const { selectionStart, selectionEnd } = editor;
    const nextValue = `${editor.value.slice(0, selectionStart)}${text}${editor.value.slice(selectionEnd)}`;
    const nextCaret = selectionStart + text.length;
    editor.value = nextValue;
    editor.setSelectionRange(nextCaret, nextCaret);
    textEditorValue.value = nextValue;
    scheduleTextEditorViewportKeepAlive();
  }

  /**
   * 提交文本编辑内容。
   */
  function commitTextEditor(): void {
    const session = textEditingSession.value;
    if (!session) {
      return;
    }

    const nextText = textEditorValue.value;
    clearTextEditing();
    if (session.kind === 'connector') {
      if (nextText !== session.originalText) {
        options.board.updateConnectorLabel(session.id, nextText);
      }
      return;
    }

    const element = findDrawingShapeElement(options.board.state.value.elements, session.id);
    if (!nextText.trim()) {
      if (element?.shape === 'text') {
        options.board.setSelection([session.id]);
        options.interaction.deleteSelection();
        return;
      }

      if (nextText !== session.originalText) {
        options.board.updateNodeText(session.id, nextText);
      }
      return;
    }

    if (nextText !== session.originalText) {
      options.board.updateNodeText(session.id, nextText);
    }
  }

  /**
   * 取消文本编辑。
   */
  function cancelTextEditor(): void {
    const session = textEditingSession.value;
    if (!session) {
      return;
    }

    clearTextEditing();
    if (session.kind === 'shape' && session.isNew) {
      options.board.setSelection([session.id]);
      options.interaction.deleteSelection();
    }
  }

  /**
   * 处理文本编辑器输入。
   * @param event - 输入事件
   */
  function handleTextEditorInput(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    textEditorValue.value = target.value;
    scheduleTextEditorViewportKeepAlive();
  }

  /**
   * 处理文本编辑框快捷键。
   * @param event - 键盘事件
   */
  function handleTextEditorKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelTextEditor();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    insertTextEditorPlainText('\n');
  }

  return {
    textEditingSession,
    textEditorValue,
    textEditingPreviewSize,
    textEditorRef,
    textEditorStyle,
    setTextEditorRef,
    startTextEditing,
    startConnectorLabelEditing,
    commitTextEditor,
    cancelTextEditor,
    handleTextEditorInput,
    handleTextEditorKeydown
  };
}
