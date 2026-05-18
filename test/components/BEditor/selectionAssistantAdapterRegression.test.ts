/**
 * @file selectionAssistantAdapterRegression.test.ts
 * @description 选区工具适配器重构后的关键交互链路回归测试。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * 读取源码文件。
 * @param relativePath - 相对仓库根目录的源码路径
 * @returns 源码文本
 */
function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

describe('selection assistant adapter regression', () => {
  test('routes AI input visibility and apply actions through the orchestration layer', () => {
    const editorIndexSource = readSource('src/components/BEditor/index.vue');
    const aiInputSource = readSource('src/components/BEditor/shared/SelectionAIInput.vue');

    expect(editorIndexSource).toContain(':visible="selectionAssistant.aiInputVisible.value"');
    expect(editorIndexSource).toContain('@update:visible="handleSelectionAIVisibleChange"');
    expect(editorIndexSource).toContain('@apply="selectionAssistant.applyAIResult($event)"');
    expect(aiInputSource).toContain("(e: 'update:visible', value: boolean): void;");
    expect(aiInputSource).toContain("(e: 'apply', content: string): void;");
    expect(aiInputSource).not.toContain('props.adapter.applyGeneratedContent(props.selectionRange, previewText.value)');
    expect(aiInputSource).not.toContain('visible.value = false;');
  });

  test('keeps rich toolbar visibility under assistant state control', () => {
    const richToolbarHostSource = readSource('src/components/BEditor/shared/SelectionToolbarRich.vue');
    const editorIndexSource = readSource('src/components/BEditor/index.vue');

    expect(richToolbarHostSource).toContain('visible?: boolean;');
    expect(richToolbarHostSource).toContain('!props.visible');
    expect(editorIndexSource).toContain(':visible="selectionAssistant.toolbarVisible.value"');
  });

  test('passes real file metadata into source-mode selection references', () => {
    const editorIndexSource = readSource('src/components/BEditor/index.vue');
    const sourceEditorPaneSource = readSource('src/components/BEditor/panes/PaneSourceEditor.vue');

    expect(editorIndexSource).toContain(':editor-state="editorState"');
    expect(sourceEditorPaneSource).toContain('editorState?: EditorState;');
    expect(sourceEditorPaneSource).toContain("editorState: () => ({ content: '', name: '', path: null, id: '', ext: '' })");
    expect(sourceEditorPaneSource).toContain('editorState: props.editorState');
  });

  test('converges sticky highlight after focus via the next selection sync', () => {
    const assistantSource = readSource('src/components/BEditor/hooks/useSelectionAssistant.ts');

    expect(assistantSource).toContain('const awaitingSelectionSyncAfterFocus = ref(false);');
    expect(assistantSource).toContain('if (awaitingSelectionSyncAfterFocus.value) {');
    expect(assistantSource).toContain('awaitingSelectionSyncAfterFocus.value = true;');
    expect(assistantSource).toContain('awaitingSelectionSyncAfterFocus.value = false;');
  });

  test('unsubscribes rich editor keydown listeners without re-reading a destroyed editor view', () => {
    const richAdapterSource = readSource('src/components/BEditor/adapters/richSelectionAssistant.ts');
    const sourceEditorPaneSource = readSource('src/components/BEditor/panes/PaneSourceEditor.vue');

    expect(richAdapterSource).toContain('const editorDom = editor.view.dom;');
    expect(richAdapterSource).toContain("editorDom.addEventListener('keydown', handleKeydown);");
    expect(richAdapterSource).toContain("editorDom.removeEventListener('keydown', handleKeydown);");
    expect(richAdapterSource).not.toContain("editor.view.dom.removeEventListener('keydown', handleKeydown);");
    expect(sourceEditorPaneSource).toContain('.cm-content');
    expect(sourceEditorPaneSource).toContain('.cm-line');
    expect(sourceEditorPaneSource).toContain('background: var(--selection-bg);');
  });
});
