/**
 * @file theme-derive.test.ts
 * @description 验证主题派生函数（toCssVars / toAntdToken / toMonacoColors）的正确性。
 */
import { describe, expect, it } from 'vitest';
import { toCssVars, toAntdToken, toMonacoColors } from '@/theme/derive';
import { light, dark } from '@/theme/tokens';

describe('toCssVars', () => {
  it('将 light token 扁平化为 CSS 变量映射', () => {
    const vars = toCssVars(light);

    expect(vars['--bg-primary']).toBe('#faf9f6');
    expect(vars['--bg-secondary']).toBe('#f0ebe1');
    expect(vars['--text-primary']).toBe('#1a1a1a');
    expect(vars['--color-primary']).toBe('#8a6f5a');
  });

  it('将 dark token 扁平化为 CSS 变量映射', () => {
    const vars = toCssVars(dark);

    expect(vars['--bg-primary']).toBe('#13151a');
    expect(vars['--text-primary']).toBe('#e8ecf2');
    expect(vars['--color-primary']).toBe('#c8a98b');
  });

  it('richEditor 组映射为 --editor- 前缀（兼容现有 Less 引用）', () => {
    const vars = toCssVars(light);

    expect(vars['--editor-text']).toBe('#212529');
    expect(vars['--editor-caret']).toBe('#212529');
    expect(vars['--editor-heading-border']).toBe('#e3dccf');
    expect(vars['--editor-blockquote-bg']).toBe('#f5f1e8');
  });

  it('usagePanel 组映射为 --usage- 前缀（兼容现有 Less 引用）', () => {
    const vars = toCssVars(light);

    expect(vars['--usage-input']).toBe('#1677ff');
    expect(vars['--usage-output']).toBe('#18cf62');
  });

  it('monaco 组映射为 --monaco- 前缀', () => {
    const vars = toCssVars(light);

    expect(vars['--monaco-foreground']).toBe('#243042');
    expect(vars['--monaco-cursor']).toBe('#2563eb');
  });

  it('sourceEditor 组映射为 --source-editor- 前缀', () => {
    const vars = toCssVars(light);

    expect(vars['--source-editor-markdown-background']).toBe('#faf9f7');
    expect(vars['--source-editor-markdown-foreground']).toBe('#2a2a28');
  });

  it('camelCase 属性名转为 kebab-case', () => {
    const vars = toCssVars(light);

    expect(vars['--color-primary-bg-hover']).toBe('rgb(138 111 90 / 16%)');
    expect(vars['--bg-hover']).toBe('rgb(107 101 96 / 8%)');
    expect(vars['--json-viewer-node-bg']).toBe('#fffdf8');
  });

  it('light 和 dark 生成的 CSS 变量名集合完全一致', () => {
    const lightVars = toCssVars(light);
    const darkVars = toCssVars(dark);

    const lightKeys = Object.keys(lightVars).sort();
    const darkKeys = Object.keys(darkVars).sort();

    expect(lightKeys).toEqual(darkKeys);
  });

  it('light 生成的 CSS 变量数量覆盖所有分组', () => {
    const vars = toCssVars(light);

    expect(Object.keys(vars).length).toBeGreaterThan(170);
  });
});

describe('toAntdToken', () => {
  it('从 light token 派生 Ant Design 主题配置', () => {
    const token = toAntdToken(light);

    expect(token.colorBgBase).toBe('#faf9f6');
    expect(token.colorBgContainer).toBe('#f0ebe1');
    expect(token.colorBgElevated).toBe('#fffdf8');
    expect(token.colorText).toBe('#1a1a1a');
    expect(token.colorTextSecondary).toBe('#6b6560');
    expect(token.colorBorder).toBe('#e3dccf');
    expect(token.colorPrimary).toBe('#8a6f5a');
    expect(token.colorPrimaryBg).toBe('rgb(138 111 90 / 10%)');
    expect(token.colorPrimaryBorder).toBe('rgb(138 111 90 / 24%)');
    expect(token.controlOutline).toBe('rgb(138 111 90 / 20%)');
  });

  it('从 dark token 派生 Ant Design 主题配置', () => {
    const token = toAntdToken(dark);

    expect(token.colorBgBase).toBe('#13151a');
    expect(token.colorBgContainer).toBe('#0d0f12');
    expect(token.colorBgElevated).toBe('#1c1f26');
    expect(token.colorText).toBe('#e8ecf2');
    expect(token.colorTextSecondary).toBe('#7a8494');
    expect(token.colorBorder).toBe('#252a35');
    expect(token.colorPrimary).toBe('#c8a98b');
    expect(token.colorPrimaryBg).toBe('rgb(200 169 139 / 10%)');
    expect(token.colorPrimaryBorder).toBe('rgb(200 169 139 / 22%)');
    expect(token.controlOutline).toBe('rgb(200 169 139 / 15%)');
  });
});

describe('toMonacoColors', () => {
  it('从 light token 派生 Monaco 编辑器颜色', () => {
    const colors = toMonacoColors(light);

    expect(colors['editor.background']).toBe('#faf9f6');
    expect(colors['editor.foreground']).toBe('#243042');
    expect(colors['editor.lineHighlightBackground']).toBe('#eef2f7');
    expect(colors['editor.selectionBackground']).toBe('#cfe3ff');
    expect(colors['editor.inactiveSelectionBackground']).toBe('#e6edf5');
    expect(colors['editorLineNumber.foreground']).toBe('#a0aec0');
    expect(colors['editorLineNumber.activeForeground']).toBe('#334155');
    expect(colors['editorCursor.foreground']).toBe('#2563eb');
    expect(colors['editorGutter.background']).toBe('#faf9f6');
    expect(colors['editorIndentGuide.background1']).toBe('#e5e7eb');
    expect(colors['editorIndentGuide.activeBackground1']).toBe('#cbd5e1');
  });

  it('从 dark token 派生 Monaco 编辑器颜色', () => {
    const colors = toMonacoColors(dark);

    expect(colors['editor.background']).toBe('#13151a');
    expect(colors['editor.foreground']).toBe('#dbe4f0');
    expect(colors['editor.lineHighlightBackground']).toBe('#1a1d24');
    expect(colors['editor.selectionBackground']).toBe('#3a4e69');
    expect(colors['editor.inactiveSelectionBackground']).toBe('#2a3544');
    expect(colors['editorLineNumber.foreground']).toBe('#64748b');
    expect(colors['editorLineNumber.activeForeground']).toBe('#e2e8f0');
    expect(colors['editorCursor.foreground']).toBe('#93c5fd');
    expect(colors['editorGutter.background']).toBe('#13151a');
    expect(colors['editorIndentGuide.background1']).toBe('#223045');
    expect(colors['editorIndentGuide.activeBackground1']).toBe('#475569');
  });

  it('返回 11 个 Monaco 颜色键', () => {
    const colors = toMonacoColors(light);

    expect(Object.keys(colors).length).toBe(11);
  });
});
