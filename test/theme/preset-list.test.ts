/**
 * @file preset-list.test.ts
 * @description 验证主题预设注册表包含新增主题并能解析对应 Token。
 */
import { describe, expect, it } from 'vitest';
import { getPresetList, getResolvedTokens, toCssVars } from '@/theme';

describe('theme preset registry', (): void => {
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
