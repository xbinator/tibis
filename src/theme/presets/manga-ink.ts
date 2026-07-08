/**
 * @file manga-ink.ts
 * @description Manga Ink 黑白线稿主题预设，强调纸张、墨线和高反差灰阶层次。
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Manga Ink 亮色基础色板。
 * 以漫画纸张、浓黑墨线和灰阶网点构成可读的黑白线稿风格。
 */
const mangaInkLight: BasePalette = {
  bg0: '#fffdf5',
  bg1: '#f4f1e8',
  bg2: '#e8e4da',
  bg3: '#d8d2c6',
  bg4: '#c7bfb1',
  fg0: '#050505',
  fg1: '#2a2a2a',
  fg2: '#6f6f6f',
  red: '#b00020',
  green: '#216e39',
  yellow: '#8a6d00',
  blue: '#1f4f7a',
  purple: '#5f4b8b',
  orange: '#8a4b00',
  cyan: '#2f6f73',
  syntaxComment: '#7a7a7a',
  syntaxKeyword: '#050505',
  syntaxString: '#2a2a2a',
  syntaxFunction: '#1f1f1f',
  syntaxNumber: '#4a4a4a',
  syntaxType: '#333333',
  syntaxVariable: '#050505',
  syntaxOperator: '#050505',
  syntaxTag: '#050505',
  syntaxAttribute: '#2a2a2a',
  accent: '#050505',
  border: '#050505',
  selectionBg: '#d7d7d7'
};

/**
 * Manga Ink 暗色基础色板。
 * 以反相墨黑背景、白色线条和深灰网点保持夜间黑白漫画质感。
 */
const mangaInkDark: BasePalette = {
  bg0: '#050505',
  bg1: '#111111',
  bg2: '#1b1b1b',
  bg3: '#282828',
  bg4: '#383838',
  fg0: '#f8f8f2',
  fg1: '#d8d8d2',
  fg2: '#8a8a84',
  red: '#ff6b6b',
  green: '#9be59b',
  yellow: '#f4d35e',
  blue: '#9cc9ff',
  purple: '#d2b8ff',
  orange: '#f2a65a',
  cyan: '#a8dadc',
  syntaxComment: '#8a8a84',
  syntaxKeyword: '#f8f8f2',
  syntaxString: '#d8d8d2',
  syntaxFunction: '#ffffff',
  syntaxNumber: '#c9c9c3',
  syntaxType: '#e8e8e2',
  syntaxVariable: '#f8f8f2',
  syntaxOperator: '#ffffff',
  syntaxTag: '#ffffff',
  syntaxAttribute: '#d8d8d2',
  accent: '#f8f8f2',
  border: '#f8f8f2',
  selectionBg: '#3f3f3f'
};

registerPreset({
  id: 'manga-ink',
  label: '黑白线稿「Manga Ink」',
  light: createThemeTokens(mangaInkLight, 'light'),
  dark: createThemeTokens(mangaInkDark, 'dark')
});
