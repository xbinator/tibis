// @vitest-environment jsdom
/**
 * @file BPromptEditorRegression.test.ts
 * @description BPromptEditor 回归测试，覆盖空态占位与文件引用 chip 行为 (CodeMirror 6).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { isPromptEditorEffectivelyEmpty, useVariableEncoder } from '@/components/BPromptEditor/hooks/useVariableEncoder';

/**
 * 读取组件源码。
 * @param relativePath - 相对仓库根目录的源码路径。
 * @returns 源码字符串。
 */
function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

describe('BPromptEditor placeholder state', () => {
  test('treats editor artifacts as empty content', () => {
    expect(isPromptEditorEffectivelyEmpty('')).toBe(true);
    expect(isPromptEditorEffectivelyEmpty('\n')).toBe(true);
    expect(isPromptEditorEffectivelyEmpty('\u00A0')).toBe(true);
    expect(isPromptEditorEffectivelyEmpty('\u200B')).toBe(true);
    expect(isPromptEditorEffectivelyEmpty('\n\u00A0\u200B')).toBe(true);
    expect(isPromptEditorEffectivelyEmpty('hello')).toBe(false);
    expect(isPromptEditorEffectivelyEmpty('{{ USER_NAME }}')).toBe(false);
  });

  test('uses v-show with editorIsEmpty ref for placeholder visibility', () => {
    const source = readSource('src/components/BPromptEditor/index.vue');

    // CodeMirror 6 implementation uses v-show with editorIsEmpty ref
    expect(source).toContain('v-show="editorIsEmpty"');
    expect(source).toContain('const editorIsEmpty = ref(true)');
    expect(source).not.toContain('data-empty="true"');
  });

  test('renders placeholder as a separate overlay instead of editor pseudo content', () => {
    const source = readSource('src/components/BPromptEditor/index.vue');

    expect(source).toContain('class="b-prompt-editor__placeholder"');
    expect(source).not.toContain("&[data-empty='true']::before");
  });

  test('drives placeholder visibility from a reactive editor empty ref in index.vue', () => {
    const indexSource = readSource('src/components/BPromptEditor/index.vue');

    // editorIsEmpty is defined locally in index.vue for CodeMirror 6
    expect(indexSource).toContain('const editorIsEmpty = ref(true)');
    expect(indexSource).toContain('editorIsEmpty.value = newValue.trim().length === 0');
    // useEditorCore.ts no longer exists in CodeMirror 6 migration
  });

  test('uses CodeMirror built-in undo/redo without custom history hooks', () => {
    const indexSource = readSource('src/components/BPromptEditor/index.vue');

    // CodeMirror 6 has built-in undo/redo via EditorView.undo/redo
    // No custom undoHistory/redoHistory refs needed
    expect(indexSource).not.toContain('undoHistory');
    expect(indexSource).not.toContain('redoHistory');
    // useEditorCore.ts and useEditorKeyboard.ts no longer exist
  });
});

describe('BPromptEditor DOM safety regressions', () => {
  test('captures and restores selection using CodeMirror selection model', () => {
    const indexSource = readSource('src/components/BPromptEditor/index.vue');

    // CodeMirror 6 uses its own selection model
    expect(indexSource).toContain('lastSelection');
    expect(indexSource).toContain('captureCursorPosition');
    expect(indexSource).toContain('view.value.state.selection');
    // useEditorCore.ts and useEditorSelection.ts no longer exist in CodeMirror 6 migration
  });
});

describe('BPromptEditor file reference chips', () => {
  test('serializes file reference chips back to stable reference-id placeholders', () => {
    const { createFileReferenceSpan, decodeVariables } = useVariableEncoder({
      getVariableLabel: () => undefined
    });
    const reference = {
      referenceId: 'ref_123',
      documentId: 'doc_123',
      filePath: 'src/foo/file.ts',
      fileName: 'file.ts',
      line: '123-145'
    };
    const chip = createFileReferenceSpan(reference);

    expect(chip.getAttribute('data-reference-id')).toBe('ref_123');
    expect(chip.getAttribute('data-document-id')).toBe('doc_123');
    expect(decodeVariables(`请看 ${chip.outerHTML}`)).toBe('请看 {{file-ref:ref_123}}');
  });

  test('renders file reference placeholders as non-editable inline chips', () => {
    const { createFileReferenceSpan, encodeVariables } = useVariableEncoder({
      getVariableLabel: () => undefined
    });
    createFileReferenceSpan({
      referenceId: 'ref_123',
      documentId: 'doc_123',
      filePath: 'src/foo/file.ts',
      fileName: 'file.ts',
      line: '123-145'
    });

    const encoded = encodeVariables('定位 {{file-ref:ref_123}}');
    const container = document.createElement('div');
    container.innerHTML = encoded;
    const chip = container.querySelector('[data-value="file-reference"]');

    expect(chip?.getAttribute('contenteditable')).toBe('false');
    expect(chip?.getAttribute('data-reference-id')).toBe('ref_123');
    expect(chip?.getAttribute('data-document-id')).toBe('doc_123');
    expect(chip?.textContent).toBe('file.ts:123-145');
  });

  test('renders unsaved file reference placeholders as non-editable inline chips', () => {
    const { createFileReferenceSpan, encodeVariables, decodeVariables } = useVariableEncoder({
      getVariableLabel: () => undefined
    });
    createFileReferenceSpan({
      referenceId: 'ref_temp',
      documentId: 'doc_temp',
      filePath: null,
      fileName: '临时笔记',
      line: '3'
    });

    const encoded = encodeVariables('定位 {{file-ref:ref_temp}}');
    const container = document.createElement('div');
    container.innerHTML = encoded;
    const chip = container.querySelector('[data-value="file-reference"]');

    expect(chip?.getAttribute('contenteditable')).toBe('false');
    expect(chip?.getAttribute('data-reference-id')).toBe('ref_temp');
    expect(chip?.getAttribute('data-document-id')).toBe('doc_temp');
    expect(chip?.textContent).toBe('临时笔记:3');
    expect(decodeVariables(encoded)).toBe('定位 {{file-ref:ref_temp}}');
  });

  test('keeps file reference chip support wired through the prompt editor insert API', () => {
    const indexSource = readSource('src/components/BPromptEditor/index.vue');
    const encoderSource = readSource('src/components/BPromptEditor/hooks/useVariableEncoder.ts');

    // insertFileReference is exposed via defineExpose in CodeMirror 6
    expect(indexSource).toContain('insertFileReference');
    expect(indexSource).toContain('captureCursorPosition');
    expect(indexSource).toContain('defineExpose');
    // createFileReferenceSpan and isChipElement are in useVariableEncoder.ts
    expect(encoderSource).toContain('createFileReferenceSpan');
    expect(encoderSource).toContain('isChipElement');
    // useEditorTrigger.ts no longer exists in CodeMirror 6 migration
  });
});
