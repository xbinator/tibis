/**
 * @file use-text-editing.test.ts
 * @description 验证 BDrawing 文本编辑 hook 的提交和取消行为。
 * @vitest-environment jsdom
 */
import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useDrawingBoard } from '@/components/BDrawing/hooks/useDrawingBoard';
import { useDrawingInteraction } from '@/components/BDrawing/hooks/useDrawingInteraction';
import { useDrawingViewport } from '@/components/BDrawing/hooks/useDrawingViewport';
import { useTextEditing } from '@/components/BDrawing/hooks/useTextEditing';
import type { DrawingShapeElement, DrawingSize } from '@/components/BDrawing/types';

/**
 * 创建测试文本元素。
 * @returns 测试文本元素
 */
function createTextElement(): DrawingShapeElement {
  return {
    id: 'text-1',
    kind: 'shape',
    shape: 'text',
    text: '旧文本',
    position: { x: 20, y: 30 },
    size: { width: 64, height: 28 },
    rotation: 0,
    style: {
      fill: 'transparent',
      fontSize: 13,
      fontWeight: 650,
      stroke: 'transparent',
      textAlign: 'center'
    },
    metadata: {
      source: 'user',
      createdAt: 1
    }
  };
}

describe('useTextEditing', (): void => {
  it('commits changed text to the board and clears the editing session', async (): Promise<void> => {
    const scope = effectScope();
    const rootRef = ref<HTMLElement | null>(document.createElement('section'));
    const viewportSize = ref<DrawingSize>({ width: 800, height: 400 });
    let textElement: DrawingShapeElement | undefined;
    let sessionCleared = false;

    scope.run((): void => {
      const board = useDrawingBoard({ elements: [createTextElement()], selection: ['text-1'] });
      const viewport = useDrawingViewport(board);
      const interaction = useDrawingInteraction(board);
      const textEditing = useTextEditing({
        board,
        interaction,
        rootRef,
        viewport,
        viewportSize
      });

      textEditing.startTextEditing(createTextElement(), false).catch((error: unknown): void => {
        throw error;
      });
      textEditing.textEditorValue.value = '新文本';
      textEditing.commitTextEditor();
      textElement = board.state.value.elements[0] as DrawingShapeElement | undefined;
      sessionCleared = textEditing.textEditingSession.value === null;
    });

    await nextTick();
    scope.stop();

    expect(textElement?.text).toBe('新文本');
    expect(sessionCleared).toBe(true);
  });
});
