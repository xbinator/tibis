/**
 * @file rich-code-block-editing.test.ts
 * @description Rich 编辑器代码块缩进与行注释快捷键测试。
 * @vitest-environment jsdom
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import type { CodeBlockIndentStyle } from '@/stores/editor/preferences';
import { handleCodeBlockKey } from '@/components/BEditor/extensions/richCodeBlockEditing';

/**
 * 可在测试中执行真实 ProseMirror 事务的编辑器桩。
 */
interface EditorHarness {
  /** 当前编辑器状态。 */
  readonly state: EditorState;
  /** 事务派发入口。 */
  view: {
    /** 应用代码块编辑事务。 */
    dispatch: (transaction: Transaction) => void;
  };
}

/**
 * 代码块按键测试选项。
 */
interface KeyPressOptions {
  /** 代码块语言。 */
  language?: string;
  /** 选区起点，相对于代码正文。 */
  from?: number;
  /** 选区终点，相对于代码正文。 */
  to?: number;
  /** 缩进方式。 */
  indentStyle?: CodeBlockIndentStyle;
  /** 缩进大小。 */
  indentSize?: number;
  /** 是否按下 Shift。 */
  shiftKey?: boolean;
  /** 是否按下 Command。 */
  metaKey?: boolean;
  /** 是否按下 Ctrl。 */
  ctrlKey?: boolean;
}

/**
 * 创建测试所需的最小 ProseMirror schema。
 * @returns 支持代码块与行内批注的 schema
 */
function createCodeSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      codeBlock: {
        attrs: { language: { default: 'plaintext' } },
        content: 'text*',
        group: 'block',
        code: true,
        marks: '_'
      },
      paragraph: { content: 'text*', group: 'block' },
      text: { group: 'inline' }
    },
    marks: {
      inlineComment: {
        attrs: {
          id: { default: null },
          comment: { default: null }
        }
      }
    }
  });
}

/**
 * 创建代码块文档。
 * @param schema - 测试 schema
 * @param code - 代码正文
 * @param language - 代码语言
 * @returns 代码块文档
 */
function createCodeDoc(schema: Schema, code: string, language: string): PMNode {
  return schema.node('doc', null, [schema.node('codeBlock', { language }, code ? schema.text(code) : undefined)]);
}

/**
 * 创建会把派发事务应用回自身的编辑器测试桩。
 * @param code - 代码正文
 * @param options - 按键测试选项
 * @returns 可读取最新状态的编辑器桩
 */
function createEditorHarness(code: string, options: KeyPressOptions = {}): EditorHarness {
  const schema = createCodeSchema();
  const doc = createCodeDoc(schema, code, options.language ?? 'typescript');
  const from = 1 + (options.from ?? 0);
  const to = 1 + (options.to ?? options.from ?? 0);
  let currentState = EditorState.create({
    doc,
    selection: TextSelection.create(doc, from, to)
  });

  return {
    get state(): EditorState {
      return currentState;
    },
    view: {
      dispatch(transaction: Transaction): void {
        currentState = currentState.apply(transaction);
      }
    }
  };
}

/**
 * 向代码块发送一次快捷键。
 * @param editor - 编辑器测试桩
 * @param key - 按键名称
 * @param options - 按键测试选项
 * @returns 快捷键事件及是否被代码块处理
 */
function pressCodeBlockKey(
  editor: EditorHarness,
  key: string,
  options: KeyPressOptions = {}
): { event: KeyboardEvent; handled: boolean } {
  const event = new KeyboardEvent('keydown', {
    key,
    cancelable: true,
    shiftKey: options.shiftKey,
    metaKey: options.metaKey,
    ctrlKey: options.ctrlKey
  });
  const handled = handleCodeBlockKey(editor, event, {
    indentStyle: options.indentStyle ?? 'spaces',
    indentSize: options.indentSize ?? 2
  });

  return { event, handled };
}

/**
 * 读取编辑器中的代码正文。
 * @param editor - 编辑器测试桩
 * @returns 当前代码正文
 */
function getCodeText(editor: EditorHarness): string {
  return editor.state.doc.firstChild?.textContent ?? '';
}

describe('handleCodeBlockKey indentation', (): void => {
  it('inserts the configured number of spaces at the caret', (): void => {
    const editor = createEditorHarness('const value = 1;', { from: 6 });
    const { event, handled } = pressCodeBlockKey(editor, 'Tab', { indentSize: 4 });

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(getCodeText(editor)).toBe('const     value = 1;');
  });

  it('inserts a literal tab when tab indentation is selected', (): void => {
    const editor = createEditorHarness('const value = 1;', { from: 0 });

    pressCodeBlockKey(editor, 'Tab', { indentStyle: 'tabs', indentSize: 6 });

    expect(getCodeText(editor)).toBe('\tconst value = 1;');
  });

  it('indents every selected line except a trailing line-boundary endpoint', (): void => {
    const editor = createEditorHarness('one\ntwo\nthree', { from: 0, to: 8 });

    pressCodeBlockKey(editor, 'Tab', { indentSize: 2 });

    expect(getCodeText(editor)).toBe('  one\n  two\nthree');
  });

  it('removes one mixed indentation unit with Shift-Tab', (): void => {
    const editor = createEditorHarness('\tfirst\n    second', { from: 0, to: 17 });

    pressCodeBlockKey(editor, 'Tab', { shiftKey: true, indentStyle: 'spaces', indentSize: 2 });

    expect(getCodeText(editor)).toBe('first\n  second');
  });
});

describe('handleCodeBlockKey line comments', (): void => {
  it('toggles a language-aware line comment after indentation', (): void => {
    const editor = createEditorHarness('  const value = 1;', { language: 'typescript', from: 8 });

    pressCodeBlockKey(editor, '/', { metaKey: true });
    expect(getCodeText(editor)).toBe('  // const value = 1;');

    pressCodeBlockKey(editor, '/', { metaKey: true });
    expect(getCodeText(editor)).toBe('  const value = 1;');
  });

  it.each([
    ['python', '# print(value)'],
    ['sql', '-- select value'],
    ['mermaid', '%% graph TD']
  ])('uses the expected prefix for %s', (language: string, expected: string): void => {
    const code = expected.slice(expected.indexOf(' ') + 1);
    const editor = createEditorHarness(code, { language });

    pressCodeBlockKey(editor, '/', { ctrlKey: true });

    expect(getCodeText(editor)).toBe(expected);
  });

  it('comments selected non-empty lines and excludes a trailing line boundary', (): void => {
    const editor = createEditorHarness('one\n\ntwo\nthree', { language: 'javascript', from: 0, to: 9 });

    pressCodeBlockKey(editor, '/', { metaKey: true });

    expect(getCodeText(editor)).toBe('// one\n\n// two\nthree');
  });

  it('removes comments only when every selected non-empty line is commented', (): void => {
    const editor = createEditorHarness('// one\n  // two', { language: 'javascript', from: 0, to: 15 });

    pressCodeBlockKey(editor, '/', { metaKey: true });

    expect(getCodeText(editor)).toBe('one\n  two');
  });

  it('silently keeps unsupported languages unchanged', (): void => {
    const editor = createEditorHarness('{"value":1}', { language: 'json', from: 3 });
    const { event, handled } = pressCodeBlockKey(editor, '/', { metaKey: true });

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(getCodeText(editor)).toBe('{"value":1}');
  });

  it('keeps an existing inline comment mark attached to its original code', (): void => {
    const schema = createCodeSchema();
    const inlineComment = schema.marks.inlineComment.create({ id: 'comment-a', comment: '检查变量名' });
    const codeBlock = schema.node('codeBlock', { language: 'typescript' }, [
      schema.text('const '),
      schema.text('answer', [inlineComment]),
      schema.text(' = 42;')
    ]);
    const doc = schema.node('doc', null, [codeBlock]);
    let currentState = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
    const editor: EditorHarness = {
      get state(): EditorState {
        return currentState;
      },
      view: {
        dispatch(transaction: Transaction): void {
          currentState = currentState.apply(transaction);
        }
      }
    };

    pressCodeBlockKey(editor, '/', { metaKey: true });

    const markedText = editor.state.doc.firstChild?.content.content.find((node: PMNode): boolean =>
      node.marks.some((mark): boolean => mark.type.name === 'inlineComment')
    );
    expect(markedText?.text).toBe('answer');
  });
});
