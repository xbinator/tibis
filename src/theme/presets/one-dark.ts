/**
 * @file one-dark.ts
 * @description One Dark 主题预设，基于 Atom One Dark 官方色板。
 * 色值来源：https://github.com/atom/one-dark-syntax
 * 亮色使用 One Light 变体。
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * One Dark 亮色基础色板（One Light 变体）。
 * 色值来源：atom/one-light-syntax
 */
const oneLight: BasePalette = {
  bg0: '#fafafa',
  bg1: '#f0f0f0',
  bg2: '#e8e8e8',
  bg3: '#e0e0e0',
  bg4: '#d8d8d8',
  fg0: '#383a42',
  fg1: '#636d83',
  fg2: '#9da5b4',
  red: '#e45649',
  green: '#50a14f',
  yellow: '#c18401',
  blue: '#4078f2',
  purple: '#a626a4',
  orange: '#986801',
  cyan: '#0184bc',
  syntaxComment: '#a0a1a7',
  syntaxKeyword: '#a626a4',
  syntaxString: '#50a14f',
  syntaxFunction: '#4078f2',
  syntaxNumber: '#986801',
  syntaxType: '#c18401',
  syntaxVariable: '#e45649',
  syntaxOperator: '#383a42',
  syntaxTag: '#50a14f',
  syntaxAttribute: '#986801',
  accent: '#4078f2',
  border: '#d8d8d8',
  selectionBg: '#e5e5e6'
};

/**
 * One Dark 暗色基础色板（原版 One Dark）。
 * 色值来源：atom/one-dark-syntax — colors/base.less + colors/syntax.less
 */
const oneDark: BasePalette = {
  bg0: '#282c34',
  bg1: '#21252b',
  bg2: '#2c313a',
  bg3: '#3e4451',
  bg4: '#4b5263',
  fg0: '#abb2bf',
  fg1: '#828997',
  fg2: '#5c6370',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  purple: '#c678dd',
  orange: '#d19a66',
  cyan: '#56b6c2',
  syntaxComment: '#5c6370',
  syntaxKeyword: '#c678dd',
  syntaxString: '#98c379',
  syntaxFunction: '#61afef',
  syntaxNumber: '#d19a66',
  syntaxType: '#e5c07b',
  syntaxVariable: '#e06c75',
  syntaxOperator: '#56b6c2',
  syntaxTag: '#e06c75',
  syntaxAttribute: '#d19a66',
  accent: '#61afef',
  border: '#3e4451',
  selectionBg: '#3e4451'
};

registerPreset({
  id: 'one-dark',
  label: '深灰色「One Dark」',
  light: createThemeTokens(oneLight, 'light'),
  dark: createThemeTokens(oneDark, 'dark')
});
