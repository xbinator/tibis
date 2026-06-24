/**
 * @file jump.ts
 * @description BCommandPanel 跳转命令 source。
 */
import type { CommandPanelGroup, CommandPanelSource } from '../types';

/** 跳转命令分组 key。 */
const JUMP_GROUP_KEY = 'jump';

/** 跳转到模型选择的命令。 */
const MODEL_ROUTE_INPUT = '> model';
/** 跳转到模型选择的显示名称。 */
const MODEL_ROUTE_TITLE = 'model';

/**
 * 创建跳转语法 source。
 * @returns 跳转命令 source
 */
export function createJumpSource(): CommandPanelSource {
  return {
    id: 'jump',
    load: (): void => undefined,
    search: (keyword: string): CommandPanelGroup[] => {
      const query = keyword.trim().toLowerCase();
      const items = [
        {
          key: 'jump:model',
          kind: 'jump' as const,
          title: MODEL_ROUTE_TITLE,
          description: '切换当前使用的模型',
          hideIcon: true,
          routeInput: MODEL_ROUTE_INPUT
        }
      ].filter((item) => item.title.toLowerCase().includes(query));

      return [{ key: JUMP_GROUP_KEY, items }];
    }
  };
}
