/**
 * @file settings-tools-routes.test.ts
 * @description 验证设置中心新增工具搜索路由与导航匹配。
 */
import { describe, expect, it } from 'vitest';
import settingsRoutes from '@/router/routes/modules/settings';

describe('settings tools routes', () => {
  it('registers /settings/tools/search and /settings/tools/mcp routes', () => {
    const settingsRoute = settingsRoutes.find((route) => route.path === 'settings');
    const toolsRoute = settingsRoute?.children?.find((route) => route.path === 'tools');
    const searchRoute = toolsRoute?.children?.find((route) => route.path === 'search');
    const mcpRoute = toolsRoute?.children?.find((route) => route.path === 'mcp');

    expect(toolsRoute?.meta?.title).toBe('工具');
    expect(settingsRoute?.meta?.tab).toEqual({
      id: 'settings',
      cacheKey: 'settings',
      title: '设置'
    });
    expect(searchRoute?.meta?.title).toBe('搜索');
    expect(mcpRoute?.meta?.title).toBe('MCP');
  });
});
