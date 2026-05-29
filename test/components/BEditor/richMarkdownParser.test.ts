/* @vitest-environment jsdom */
/**
 * @file richMarkdownParser.test.ts
 * @description 验证 createRichMarkdownSchemaExtensions + createRichEditorRuntimeOnlyExtensions
 * 产生与现有完整扩展集等价的行为。
 * 阶段一 REFACTOR：测试新拆分函数的 markdown round-trip 与当前保持一致。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { JSONContent } from '@tiptap/core';
import { ref } from 'vue';
import { Editor } from '@tiptap/core';
import { describe, expect, test } from 'vitest';
import { createSourceLineTracker } from '@/components/BEditor/adapters/sourceLineMapping';
import { parseMarkdownForRichLoad } from '@/components/BEditor/hooks/richMarkdownParser';
import { createRichMarkdownSchemaExtensions, createRichEditorRuntimeOnlyExtensions, useExtensions } from '@/components/BEditor/hooks/useExtensions';
import { getPersistedMarkdown } from '@/components/BEditor/utils/editorMarkdown';

/**
 * 递归移除 heading 节点的 id 属性以进行结构化等价对比。
 * @param node - 待归一化的节点
 * @returns 归一化后的节点
 */
function normalizeHeadingIds(node: JSONContent): JSONContent {
  const normalized = { ...node };

  if (normalized.type === 'heading' && normalized.attrs) {
    const rest = { ...normalized.attrs };
    delete rest.id;
    normalized.attrs = rest;
  }

  if (Array.isArray(normalized.content)) {
    normalized.content = normalized.content.map((child) => normalizeHeadingIds(child));
  }

  return normalized;
}

describe('createRichMarkdownSchemaExtensions', () => {
  test('schema + runtime extensions produce identical JSON to current useExtensions', () => {
    const markdown = '# 标题\n\n段落\n\n- A\n- B\n\n```js\nconst x = 1;\n```\n\n| H1 | H2 |\n|----|----|\n| 1  | 2  |';

    // 当前路径：useExtensions
    const currentResult = useExtensions(ref('test-current'));
    const currentEditor = new Editor({
      extensions: currentResult.editorExtensions,
      content: markdown,
      contentType: 'markdown'
    });
    const currentJson = normalizeHeadingIds(currentEditor.getJSON());
    const currentMarkdown = getPersistedMarkdown(currentEditor);
    currentEditor.destroy();

    // 新路径：schema + runtime
    const tracker = createSourceLineTracker();
    const schemaResult = createRichMarkdownSchemaExtensions('test-split', tracker);
    const runtimeExts = createRichEditorRuntimeOnlyExtensions('test-split');
    const splitEditor = new Editor({
      extensions: [...schemaResult.extensions, ...runtimeExts],
      content: markdown,
      contentType: 'markdown'
    });
    const splitJson = normalizeHeadingIds(splitEditor.getJSON());
    const splitMarkdown = getPersistedMarkdown(splitEditor);
    splitEditor.destroy();

    expect(splitJson).toEqual(currentJson);
    expect(splitMarkdown).toBe(currentMarkdown);
  });

  test('schema-only extensions can parse markdown (no NodeView, no browser runtime plugins)', () => {
    const markdown = '# A\n\nparagraph\n\n- item\n\n```\ncode\n```';

    const tracker = createSourceLineTracker();
    const schemaResult = createRichMarkdownSchemaExtensions('test-schema-only', tracker);
    const schemaEditor = new Editor({
      extensions: schemaResult.extensions,
      content: markdown,
      contentType: 'markdown'
    });

    const exported = getPersistedMarkdown(schemaEditor);
    schemaEditor.destroy();

    expect(exported).toBe(markdown);
  });
});

describe('parseMarkdownForRichLoad', () => {
  test('parses through MarkdownManager without constructing a temporary Editor', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/BEditor/hooks/richMarkdownParser.ts'), 'utf8');

    expect(source).not.toContain('new Editor(');
  });

  test('returns valid JSONContent for simple markdown', async () => {
    const result = await parseMarkdownForRichLoad('# Hello\n\nWorld', 'test', 'req-1');

    expect(result.json.type).toBe('doc');
    expect(result.json.content).toBeDefined();
    expect(result.json.content!.length).toBeGreaterThan(0);
    expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.nodeCount).toBeGreaterThan(0);
  });

  test('reuses cached JSON when the same editor instance parses unchanged markdown', async () => {
    const markdown = '# Cache Probe\n\nThe second rich load should avoid Markdown reparsing.';

    const first = await parseMarkdownForRichLoad(markdown, 'cache-test', 'req-cache-1');
    const second = await parseMarkdownForRichLoad(markdown, 'cache-test', 'req-cache-2');

    expect(first.stats.cacheHit).toBe(false);
    expect(second.stats.cacheHit).toBe(true);
    expect(second.json).toEqual(first.json);
  });

  test('parsed JSON can be loaded into editor and produces same markdown', async () => {
    const markdown = '# 标题\n\n段落内容\n\n- 列表项1\n- 列表项2';
    const result = await parseMarkdownForRichLoad(markdown, 'test', 'req-2');

    const tracker = createSourceLineTracker();
    const schemaExts = createRichMarkdownSchemaExtensions('test', tracker);
    const runtimeExts = createRichEditorRuntimeOnlyExtensions('test');
    const editor = new Editor({
      extensions: [...schemaExts.extensions, ...runtimeExts],
      content: result.json
    });

    const exported = getPersistedMarkdown(editor);
    editor.destroy();

    expect(exported).toBe(markdown);
  });

  test('throws when AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(parseMarkdownForRichLoad('# test', 'test', 'req-3', controller.signal)).rejects.toThrow('Aborted');
  });

  test('stats nodeCount matches editor document node count', async () => {
    const markdown = '# A\n## B\n### C\n\nparagraph\n\n- item1\n- item2';
    const result = await parseMarkdownForRichLoad(markdown, 'test', 'req-4');

    const tracker = createSourceLineTracker();
    const schemaExts = createRichMarkdownSchemaExtensions('test', tracker);
    const runtimeExts = createRichEditorRuntimeOnlyExtensions('test');
    const editor = new Editor({
      extensions: [...schemaExts.extensions, ...runtimeExts],
      content: result.json
    });

    let editorNodeCount = 0;
    editor.state.doc.descendants(() => {
      editorNodeCount++;
    });
    editor.destroy();

    // parseMarkdownForRichLoad 统计包含根 doc 节点，editor.descendants 不包含
    // 因此 countNodes(json) = editorNodeCount + 1
    expect(result.stats.nodeCount).toBe(editorNodeCount + 1);
  });
});
