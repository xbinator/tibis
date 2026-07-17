/**
 * @file use-slash-commands.test.ts
 * @description BChat 手动上下文压缩斜杠命令测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { chatSlashCommands, createSkillSlashCommands, useSlashCommands } from '@/components/BChat/hooks/useSlashCommands';

/**
 * 创建斜杠命令 handlers。
 * @param busy - 当前是否忙碌
 * @returns handlers 与 compact spy
 */
function createHandlers(busy: boolean) {
  const compactContext = vi.fn();
  const onBusyCommandRejected = vi.fn();

  return {
    compactContext,
    onBusyCommandRejected,
    handlers: {
      openModelSelector: vi.fn(),
      createNewSession: vi.fn(),
      clearInput: vi.fn(),
      compactContext,
      isBusy: (): boolean => busy,
      onBusyCommandRejected
    }
  };
}

describe('BChat /compact command', (): void => {
  it('registers /compact and dispatches it only while idle', async (): Promise<void> => {
    expect(chatSlashCommands).toContainEqual(expect.objectContaining({ id: 'compact', trigger: '/compact', selectAction: { type: 'emit' } }));
    const idle = createHandlers(false);
    const busy = createHandlers(true);

    const compactCommand = {
      id: 'compact',
      trigger: '/compact',
      title: '压缩上下文',
      description: '压缩当前长会话上下文',
      selectAction: { type: 'emit' }
    } as const;
    await useSlashCommands(idle.handlers).handleSlashCommand(compactCommand);
    await useSlashCommands(busy.handlers).handleSlashCommand(compactCommand);

    expect(idle.compactContext).toHaveBeenCalledOnce();
    expect(busy.compactContext).not.toHaveBeenCalled();
    expect(busy.onBusyCommandRejected).toHaveBeenCalledWith('compact');
  });

  it('creates stable Skill entries only for enabled definitions without parse errors', (): void => {
    const commands = createSkillSlashCommands([
      {
        name: 'weather',
        description: '查询天气',
        content: 'instructions',
        contentHash: 'hash-weather',
        filePath: '/skills/weather/SKILL.md',
        dirPath: '/skills/weather',
        source: 'global',
        enabled: true,
        parsedAt: 1
      },
      {
        name: 'disabled',
        description: 'disabled',
        content: '',
        filePath: '/skills/disabled/SKILL.md',
        dirPath: '/skills/disabled',
        source: 'global',
        enabled: false,
        parsedAt: 1
      },
      {
        name: 'broken',
        description: 'broken',
        content: '',
        filePath: '/skills/broken/SKILL.md',
        dirPath: '/skills/broken',
        source: 'global',
        enabled: true,
        parsedAt: 1,
        parseError: 'broken'
      }
    ]);

    expect(commands).toEqual([
      expect.objectContaining({
        id: 'skill:weather',
        trigger: '/weather',
        group: 'skill',
        groupTitle: '技能',
        selectAction: { type: 'insert', text: '{{$weather}}' }
      })
    ]);
  });
});
