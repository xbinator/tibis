/**
 * @file slash-command-context.test.ts
 * @description BSmart 斜杠查询范围、过滤与通用选中行为测试。
 * @vitest-environment jsdom
 */
import { computed, shallowRef } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { findSlashCommandContext, isSlashCommandMatch, useSlashCommand } from '@/components/BSmart/hooks/useSlashCommand';
import type { SlashCommandOption } from '@/components/BSmart/types';

/** 测试命令候选。 */
const COMMANDS: SlashCommandOption[] = [
  {
    id: 'model',
    trigger: '/model',
    title: '模型',
    description: '切换当前模型',
    group: 'command',
    selectAction: { type: 'emit' }
  },
  {
    id: 'template',
    trigger: '/template',
    title: '模板助手',
    description: '插入常用模板',
    group: 'template',
    selectAction: { type: 'insert', text: '{{template}}' }
  }
];

describe('BSmart slash command context', (): void => {
  it('finds a query at input start, line start or after whitespace', (): void => {
    expect(findSlashCommandContext('/tem', 4, COMMANDS)).toEqual({ from: 0, to: 4, query: 'tem' });
    expect(findSlashCommandContext('帮我用 /tem 查询', 8, COMMANDS)).toEqual({ from: 4, to: 8, query: 'tem' });
    expect(findSlashCommandContext('第一行\n/tem', 8, COMMANDS)).toEqual({ from: 4, to: 8, query: 'tem' });
  });

  it('rejects URLs, file paths, dates, whitespace and unmatched queries', (): void => {
    expect(findSlashCommandContext('https://example.com', 8, COMMANDS)).toBeNull();
    expect(findSlashCommandContext('src/foo.ts', 7, COMMANDS)).toBeNull();
    expect(findSlashCommandContext('2026/07/14', 7, COMMANDS)).toBeNull();
    expect(findSlashCommandContext('/template value', 15, COMMANDS)).toBeNull();
    expect(findSlashCommandContext('/unknown', 8, COMMANDS)).toBeNull();
  });

  it('matches trigger prefixes as well as localized titles and descriptions', (): void => {
    expect(isSlashCommandMatch(COMMANDS[1], 'tem')).toBe(true);
    expect(isSlashCommandMatch(COMMANDS[1], '模板')).toBe(true);
    expect(isSlashCommandMatch(COMMANDS[1], '常用')).toBe(true);
    expect(isSlashCommandMatch(COMMANDS[1], '模型')).toBe(false);
  });

  it('replaces only the active range for a configured insertion', (): void => {
    const parent = document.createElement('div');
    const editor = new EditorView({
      parent,
      state: EditorState.create({ doc: '帮我用 /tem 查询上海', selection: { anchor: 8 } })
    });
    const view = shallowRef<EditorView | null>(editor);
    const emit = vi.fn();
    const slashCommand = useSlashCommand(
      view,
      computed(() => COMMANDS),
      emit
    );
    slashCommand.syncSlashCommandState(editor.state, editor);

    slashCommand.handleSlashCommandSelect(COMMANDS[1]);

    expect(editor.state.doc.toString()).toBe('帮我用 {{template}} 查询上海');
    expect(emit).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('removes the active range and emits a generic command action', (): void => {
    const parent = document.createElement('div');
    const editor = new EditorView({
      parent,
      state: EditorState.create({ doc: '/mod', selection: { anchor: 4 } })
    });
    const view = shallowRef<EditorView | null>(editor);
    const emit = vi.fn();
    const slashCommand = useSlashCommand(
      view,
      computed(() => COMMANDS),
      emit
    );
    slashCommand.syncSlashCommandState(editor.state, editor);

    slashCommand.handleSlashCommandSelect(COMMANDS[0]);

    expect(editor.state.doc.toString()).toBe('');
    expect(emit).toHaveBeenCalledWith('slash-command', COMMANDS[0]);
    editor.destroy();
  });
});
