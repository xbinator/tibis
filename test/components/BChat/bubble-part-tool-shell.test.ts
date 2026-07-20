/**
 * @file bubble-part-tool-shell.test.ts
 * @description Shell tool 气泡的实时 Screen Snapshot 和自动回答标记测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageToolPart } from 'types/chat';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartTool from '@/components/BChat/components/MessageBubble/BubblePartTool/index.vue';

vi.mock('@/hooks/useNavigate', () => ({ useNavigate: () => ({ openFile: vi.fn() }) }));

describe('BubblePartTool Shell display', (): void => {
  it('renders the current screen and Tibis auto-answer marker separately', (): void => {
    const part: ChatMessageToolPart = {
      id: 'part-1',
      type: 'tool',
      toolCallId: 'command-1',
      toolName: 'run_shell_command',
      status: 'executing',
      input: { command: 'interactive' },
      shellRunState: {
        terminalContent: 'Installing package...\n\nContinue?',
        autoAnswers: [1, 2, 3],
        lastSequence: 4,
        finished: false
      }
    };
    const wrapper = mount(BubblePartTool, {
      props: { part },
      global: {
        stubs: {
          BIcon: true,
          BTruncateText: { props: ['text'], template: '<span>{{ text }}</span>' }
        }
      }
    });

    expect(wrapper.find('.bubble-part-tool__shell-terminal').text()).toContain('Continue?');
    expect(wrapper.findAll('.bubble-part-tool__shell-auto-answer')).toHaveLength(3);
    expect(wrapper.text()).toContain('Automatically selected default option (3)');
    expect(wrapper.findComponent({ name: 'ConfirmationSheet' }).exists()).toBe(false);
  });

  it('restores terminal metadata from a persisted structured failure', (): void => {
    const part: ChatMessageToolPart = {
      id: 'part-failure',
      type: 'tool',
      toolCallId: 'command-failure',
      toolName: 'run_shell_command',
      status: 'done',
      input: { command: 'interactive' },
      result: {
        toolName: 'run_shell_command',
        status: 'failure',
        error: {
          code: 'INTERACTION_TIMEOUT',
          message: 'interaction timeout',
          details: { terminalOutput: 'Choose action?', autoInteraction: { enabled: true, answerCount: 2 } }
        }
      }
    };
    const wrapper = mount(BubblePartTool, {
      props: { part },
      global: {
        stubs: {
          BIcon: true,
          BTruncateText: { props: ['text'], template: '<span>{{ text }}</span>' }
        }
      }
    });

    expect(wrapper.find('.bubble-part-tool__shell-terminal').text()).toContain('Choose action?');
    expect(wrapper.find('.bubble-part-tool__shell-auto-answer').text()).toContain('(2)');
  });
});
