import type { AIToolContext } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createEditorToolContextRegistry } from '@/ai/tools/editor-context';

function createContext(id: string): AIToolContext {
  return {
    document: {
      id,
      title: `Title ${id}`,
      path: null,
      getContent: () => `Content ${id}`
    },
    editor: {
      getSelection: () => null,
      insertAtCursor: async () => undefined,
      replaceSelection: async () => undefined,
      replaceDocument: async () => undefined
    }
  };
}

describe('editor tool context registry', () => {
  it('returns undefined when no active context exists', () => {
    const registry = createEditorToolContextRegistry();

    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('registers and returns the active context', () => {
    const registry = createEditorToolContextRegistry();
    const context = createContext('editor-1');

    registry.register('editor-1', context);

    expect(registry.getCurrentContext()?.document.id).toBe('editor-1');
    expect(registry.getCurrentContext()?.document.getContent()).toBe('Content editor-1');
  });

  it('removes the active context when it is unregistered', () => {
    const registry = createEditorToolContextRegistry();

    registry.register('editor-1', createContext('editor-1'));
    registry.unregister('editor-1');

    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('keeps the most recently registered context active', () => {
    const registry = createEditorToolContextRegistry();

    registry.register('editor-1', createContext('editor-1'));
    registry.register('editor-2', createContext('editor-2'));

    expect(registry.getCurrentContext()?.document.id).toBe('editor-2');
  });
});
