/**
 * @file preset-list.test.ts
 * @description 验证主题预设注册表包含新增主题并能解析对应 Token。
 */
import { describe, expect, it } from 'vitest';
import { getPresetList, getResolvedTokens, toCssVars } from '@/theme';

/**
 * 已从主题选择器移除的主题预设。
 */
interface RemovedThemePreset {
  /** 主题预设 ID */
  id: string;
  /** 主题预设显示名称 */
  label: string;
}

/**
 * 用户不再需要展示的主题色名称集合。
 */
const REMOVED_THEME_PRESETS: RemovedThemePreset[] = [
  { id: 'velora', label: '晴空蓝「Velora」' },
  { id: 'everforest', label: '柔绿色「Everforest」' },
  { id: 'tokyonight', label: '紫蓝色「Tokyonight」' },
  { id: 'ayu', label: '暖黄色「Ayu」' },
  { id: 'catppuccin', label: '奶咖色「Catppuccin」' },
  { id: 'catppuccin-macchiato', label: '深咖色「Catppuccin」' },
  { id: 'gruvbox', label: '棕黄色「Gruvbox」' },
  { id: 'kanagawa', label: '靛蓝色「Kanagawa」' },
  { id: 'nord', label: '冰蓝色「Nord」' },
  { id: 'one-dark', label: '深灰色「One Dark」' }
];

describe('theme preset registry', (): void => {
  it('omits removed color theme presets from the public preset list', (): void => {
    const presets = getPresetList();

    for (const preset of REMOVED_THEME_PRESETS) {
      expect(presets).not.toContainEqual(preset);
    }
  });

  it('registers the soft monochrome Graphite theme preset', (): void => {
    const presets = getPresetList();

    expect(presets).toContainEqual({ id: 'graphite', label: '柔和黑白「Graphite」' });
  });

  it('resolves Graphite tokens for soft gray product shell modes', (): void => {
    const lightTokens = getResolvedTokens('graphite', 'light');
    const darkTokens = getResolvedTokens('graphite', 'dark');
    const lightCssVars = toCssVars(lightTokens);

    expect(lightTokens.bg.primary).toBe('#ffffff');
    expect(lightTokens.bg.secondary).toBe('#f4f4f4');
    expect(lightTokens.bg.tertiary).toBe('#eeeeee');
    expect(lightTokens.color.primary).toBe('#1f1f1f');
    expect(lightTokens.border.primary).toBe('#e5e5e5');
    expect(darkTokens.bg.primary).toBe('#121212');
    expect(darkTokens.bg.secondary).toBe('#1a1a1a');
    expect(darkTokens.color.primary).toBe('#f5f5f5');
    expect(lightCssVars['--color-primary']).toBe('#1f1f1f');
  });

  it('registers the high-contrast Shonen theme preset', (): void => {
    const presets = getPresetList();

    expect(presets).toContainEqual({ id: 'shonen', label: '热血红黑「Shonen」' });
  });

  it('resolves Shonen light and dark tokens for manga paper and red-black modes', (): void => {
    const lightTokens = getResolvedTokens('shonen', 'light');
    const darkTokens = getResolvedTokens('shonen', 'dark');
    const darkCssVars = toCssVars(darkTokens);

    expect(lightTokens.bg.primary).toBe('#fff8e7');
    expect(lightTokens.text.primary).toBe('#111111');
    expect(lightTokens.color.primary).toBe('#e60012');
    expect(darkTokens.bg.primary).toBe('#07070a');
    expect(darkTokens.text.primary).toBe('#fff3e0');
    expect(darkTokens.color.primary).toBe('#ff1f3d');
    expect(darkCssVars['--color-primary']).toBe('#ff1f3d');
  });

  it('registers the monochrome Manga Ink theme preset', (): void => {
    const presets = getPresetList();

    expect(presets).toContainEqual({ id: 'manga-ink', label: '黑白线稿「Manga Ink」' });
  });

  it('resolves Manga Ink light and dark tokens for ink paper and inverse ink modes', (): void => {
    const lightTokens = getResolvedTokens('manga-ink', 'light');
    const darkTokens = getResolvedTokens('manga-ink', 'dark');
    const lightCssVars = toCssVars(lightTokens);

    expect(lightTokens.bg.primary).toBe('#fffdf5');
    expect(lightTokens.text.primary).toBe('#050505');
    expect(lightTokens.color.primary).toBe('#050505');
    expect(darkTokens.bg.primary).toBe('#050505');
    expect(darkTokens.text.primary).toBe('#f8f8f2');
    expect(darkTokens.color.primary).toBe('#f8f8f2');
    expect(lightCssVars['--border-primary']).toBe('#050505');
  });
});
