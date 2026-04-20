import { describe, expect, it } from 'vitest';
import { getDefaultChatToolNames, getProviderToolSupport } from '@/ai/tools/policy';

describe('AI tool policy', () => {
  it('enables native tools for validated providers', () => {
    expect(
      getProviderToolSupport({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        isCustom: false
      })
    ).toEqual({ supported: true });
  });

  it('disables native tools for unvalidated default providers', () => {
    expect(
      getProviderToolSupport({
        id: 'moonshot',
        name: 'Moonshot',
        type: 'openai',
        isCustom: false
      })
    ).toEqual({
      supported: false,
      reason: 'Moonshot 暂未纳入 AI Tools 首批验证范围'
    });
  });

  it('disables native tools for custom providers until compatibility is verified', () => {
    expect(
      getProviderToolSupport({
        id: 'custom-openai',
        name: 'Custom OpenAI',
        type: 'openai',
        isCustom: true
      })
    ).toEqual({
      supported: false,
      reason: '自定义服务商的工具调用兼容性尚未验证'
    });
  });

  it('returns the default low-risk chat tool names', () => {
    expect(getDefaultChatToolNames()).toEqual(['read_current_document', 'get_current_selection', 'search_current_document', 'insert_at_cursor']);
  });
});
