/**
 * @file everforest.ts
 * @description Everforest 主题预设，基于 sainnhe/everforest 官方色板。
 * 色值来源：https://github.com/sainnhe/everforest
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Everforest 亮色基础色板（medium 背景）。
 * 色值来源：autoload/everforest.vim — palette1 (light medium) + palette2 (light)
 */
const everforestLight: BasePalette = {
  bg0: '#fdf6e3',
  bg1: '#f4f0d9',
  bg2: '#efebd4',
  bg3: '#e6e2cc',
  bg4: '#e0dcc7',
  fg0: '#5c6a72',
  fg1: '#939f91',
  fg2: '#a6b0a0',
  red: '#f85552',
  green: '#8da101',
  yellow: '#dfa000',
  blue: '#3a94c5',
  purple: '#df69ba',
  orange: '#f57d26',
  cyan: '#35a77c',
  syntaxComment: '#939f91',
  syntaxKeyword: '#f85552',
  syntaxString: '#8da101',
  syntaxFunction: '#df69ba',
  syntaxNumber: '#dfa000',
  syntaxType: '#35a77c',
  syntaxVariable: '#f57d26',
  syntaxOperator: '#5c6a72',
  syntaxTag: '#35a77c',
  syntaxAttribute: '#3a94c5',
  accent: '#8da101',
  border: '#e0dcc7',
  selectionBg: '#eaedc8'
};

/**
 * Everforest 暗色基础色板（medium 背景）。
 * 色值来源：autoload/everforest.vim — palette1 (dark medium) + palette2 (dark)
 */
const everforestDark: BasePalette = {
  bg0: '#2d353b',
  bg1: '#343f44',
  bg2: '#3d484d',
  bg3: '#475258',
  bg4: '#4f585e',
  fg0: '#d3c6aa',
  fg1: '#859289',
  fg2: '#9da9a0',
  red: '#e67e80',
  green: '#a7c080',
  yellow: '#dbbc7f',
  blue: '#7fbbb3',
  purple: '#d699b6',
  orange: '#e69875',
  cyan: '#83c092',
  syntaxComment: '#859289',
  syntaxKeyword: '#e67e80',
  syntaxString: '#a7c080',
  syntaxFunction: '#d699b6',
  syntaxNumber: '#dbbc7f',
  syntaxType: '#83c092',
  syntaxVariable: '#e69875',
  syntaxOperator: '#d3c6aa',
  syntaxTag: '#83c092',
  syntaxAttribute: '#7fbbb3',
  accent: '#a7c080',
  border: '#4f585e',
  selectionBg: '#543a48'
};

registerPreset({
  id: 'everforest',
  label: '绿色',
  light: createThemeTokens(everforestLight, 'light'),
  dark: createThemeTokens(everforestDark, 'dark')
});
