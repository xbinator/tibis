/**
 * @file chat-slash-commands.test.ts
 * @description BChatSidebar 聊天斜杠命令注册表测试，校验首版动作命令的顺序与类型。
 */
import { describe, expect, test } from 'vitest';
import { chatSlashCommands } from '@/components/BChatSidebar/utils/slashCommands';

describe('chatSlashCommands', () => {
  test('exports first-version action commands in trigger order', () => {
    expect(chatSlashCommands.map((command) => command.trigger)).toEqual(['/model', '/usage', '/new', '/clear']);
    expect(chatSlashCommands.every((command) => command.type === 'action')).toBe(true);
  });
});
