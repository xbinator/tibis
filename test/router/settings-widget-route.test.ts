/**
 * @file settings-widget-route.test.ts
 * @description 设置页小组件管理入口路由测试。
 */
import { describe, expect, it } from 'vitest';
import routes from '@/router/routes/modules/settings';
import { MENU_ITEMS, menuGroups } from '@/views/settings/constants';

describe('settings widget route', (): void => {
  it('registers widget management route and menu item', (): void => {
    const settingsRoute = routes[0];
    const toolsRoute = settingsRoute?.children?.find((route) => route.path === 'tools');
    const widgetRoute = toolsRoute?.children?.find((route) => route.path === 'widget');
    const featureGroup = menuGroups.find((group) => group.label === '功能配置');

    expect(MENU_ITEMS.widget).toMatchObject({
      key: 'widget',
      label: '小组件',
      icon: 'lucide:blocks',
      path: '/settings/tools/widget'
    });
    expect(featureGroup?.items.map((item) => item.key)).toContain('widget');
    expect(widgetRoute?.name).toBe('widget-tools-settings');
    expect(widgetRoute?.meta?.title).toBe('小组件');
    expect(widgetRoute?.children).toBeUndefined();
  });
});
