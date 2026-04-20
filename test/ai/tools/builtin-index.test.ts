import { describe, expect, it } from 'vitest';
import { createBuiltinTools } from '@/ai/tools/builtin';

describe('createBuiltinTools', () => {
  it('returns read tools by default', () => {
    expect(createBuiltinTools().map((tool) => tool.definition.name)).toEqual(['read_current_document', 'get_current_selection', 'search_current_document']);
  });

  it('only exposes low-risk write tools by default when confirmation is available', () => {
    const tools = createBuiltinTools({
      confirm: {
        confirm: async () => true
      }
    });

    expect(tools.map((tool) => tool.definition.name)).toEqual([
      'read_current_document',
      'get_current_selection',
      'search_current_document',
      'insert_at_cursor'
    ]);
  });

  it('can opt into selection replacement and dangerous document replacement explicitly', () => {
    const tools = createBuiltinTools({
      confirm: {
        confirm: async () => true
      },
      includeSelectionReplace: true,
      includeDangerous: true
    });

    expect(tools.map((tool) => tool.definition.name)).toEqual([
      'read_current_document',
      'get_current_selection',
      'search_current_document',
      'insert_at_cursor',
      'replace_selection',
      'replace_document'
    ]);
  });
});
