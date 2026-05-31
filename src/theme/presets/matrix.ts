/**
 * @file matrix.ts
 * @description Matrix 主题预设——黑客风格黑底绿字主题。
 * 灵感来源于《黑客帝国》数字雨视觉效果，以深黑背景搭配荧光绿为主色调。
 * 亮色变体为浅灰底色搭配深绿色系，保持可读性。
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Matrix 亮色基础色板（浅灰底 + 深绿系）。
 * 保持可读性的同时延续绿色主色调。
 */
const matrixLight: BasePalette = {
  bg0: '#e8efe8',
  bg1: '#dce5dc',
  bg2: '#d0dbd0',
  bg3: '#c2d0c2',
  bg4: '#b4c4b4',
  fg0: '#1a2e1a',
  fg1: '#3a5a3a',
  fg2: '#5a7a5a',
  red: '#a83232',
  green: '#2d7a2d',
  yellow: '#7a7a2d',
  blue: '#2d5a7a',
  purple: '#5a3a7a',
  orange: '#7a5a2d',
  cyan: '#2d7a7a',
  syntaxComment: '#5a7a5a',
  syntaxKeyword: '#2d5a7a',
  syntaxString: '#2d7a2d',
  syntaxFunction: '#2d5a7a',
  syntaxNumber: '#7a5a2d',
  syntaxType: '#2d7a7a',
  syntaxVariable: '#1a2e1a',
  syntaxOperator: '#1a2e1a',
  syntaxTag: '#2d7a7a',
  syntaxAttribute: '#2d5a7a',
  accent: '#2d7a2d',
  border: '#b4c4b4',
  selectionBg: '#c2d0c2'
};

/**
 * Matrix 暗色基础色板——经典黑底绿字。
 * 以纯黑背景搭配荧光绿，营造终端/黑客氛围。
 */
const matrixDark: BasePalette = {
  bg0: '#0a0a0a',
  bg1: '#0d0d0d',
  bg2: '#111111',
  bg3: '#1a1a1a',
  bg4: '#222222',
  fg0: '#00ff41',
  fg1: '#00cc33',
  fg2: '#008f22',
  red: '#ff3333',
  green: '#00ff41',
  yellow: '#aaff00',
  blue: '#00aaff',
  purple: '#aa00ff',
  orange: '#ff8800',
  cyan: '#00ffcc',
  syntaxComment: '#006622',
  syntaxKeyword: '#00ffcc',
  syntaxString: '#00ff41',
  syntaxFunction: '#00aaff',
  syntaxNumber: '#aaff00',
  syntaxType: '#00ffcc',
  syntaxVariable: '#00ff41',
  syntaxOperator: '#00cc33',
  syntaxTag: '#00ffcc',
  syntaxAttribute: '#00aaff',
  accent: '#00ff41',
  border: '#003311',
  selectionBg: '#003311'
};

registerPreset({
  id: 'matrix',
  label: '荧光绿「Matrix」',
  light: createThemeTokens(matrixLight, 'light'),
  dark: createThemeTokens(matrixDark, 'dark')
});
