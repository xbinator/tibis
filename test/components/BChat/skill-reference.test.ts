/**
 * @file skill-reference.test.ts
 * @description SkillReference Token 编码、解析与草稿恢复测试。
 */
import type { ChatMessagePart } from 'types/chat';
import { describe, expect, it } from 'vitest';
import {
  createSkillReferenceToken,
  findSkillReferenceTokens,
  parseSkillReferenceBody,
  restoreSkillReferenceTokens
} from '@/components/BChat/utils/skillReference';

describe('SkillReference token utilities', (): void => {
  it('round-trips readable names containing Chinese, spaces and reserved characters', (): void => {
    const name = '天气 / 上海? #1';
    const token = createSkillReferenceToken(name);

    expect(token).toBe('{{$天气 / 上海? #1}}');
    expect(findSkillReferenceTokens(`before ${token} after`)).toEqual([
      {
        name,
        start: 7,
        end: 7 + token.length,
        token
      }
    ]);
    expect(parseSkillReferenceBody(token.slice(2, -2))).toBe(name);
  });

  it('rejects empty names, braces and line breaks', (): void => {
    expect(parseSkillReferenceBody('$')).toBeNull();
    expect(parseSkillReferenceBody('$bad{name')).toBeNull();
    expect(parseSkillReferenceBody('$bad\nname')).toBeNull();
    expect(findSkillReferenceTokens('{{$}} {{$bad{name}} {{$bad\nname}}')).toEqual([]);
    expect((): string => createSkillReferenceToken('bad{name')).toThrow('Skill name');
    expect((): string => createSkillReferenceToken('bad\nname')).toThrow('Skill name');
  });

  it('restores tokens only from structured SkillReference parts', (): void => {
    const parts: ChatMessagePart[] = [
      { id: 'text-before', type: 'text', text: '请用 ' },
      {
        id: 'skill-reference',
        type: 'skill_reference',
        name: '天气 / 上海',
        sourceText: { start: 3, end: 40, value: createSkillReferenceToken('天气 / 上海') }
      },
      { id: 'text-after', type: 'text', text: ' 查询' }
    ];

    expect(restoreSkillReferenceTokens(`请用 ${createSkillReferenceToken('天气 / 上海')} 查询`, parts)).toBe(
      `请用 ${createSkillReferenceToken('天气 / 上海')} 查询`
    );
    expect(restoreSkillReferenceTokens('旧消息里的 $weather', [{ id: 'legacy', type: 'text', text: '旧消息里的 $weather' }])).toBe('旧消息里的 $weather');
  });
});
