/**
 * @file slashCommands.ts
 * @description Chat sidebar slash command registry metadata.
 */
import type { SlashCommandOption } from '@/components/BPromptEditor/types';

/**
 * First-version chat slash commands exposed in trigger order.
 */
export const chatSlashCommands: SlashCommandOption[] = [
  {
    trigger: '/model',
    label: 'Model',
    type: 'action'
  },
  {
    trigger: '/usage',
    label: 'Usage',
    type: 'action'
  },
  {
    trigger: '/new',
    label: 'New Chat',
    type: 'action'
  },
  {
    trigger: '/clear',
    label: 'Clear Chat',
    type: 'action'
  }
];
