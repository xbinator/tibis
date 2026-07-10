/**
 * @file icons.test.ts
 * @description 文件图标解析工具测试。
 */
import { describe, expect, it } from 'vitest';
import { resolveFileIcon } from '@/utils/file/icons';

/**
 * 特殊 Markdown 文件名图标期望。
 */
interface SpecialMarkdownIconExpectation {
  /** 完整文件名。 */
  fileName: string;
  /** 期望展示的 Iconify 图标名。 */
  icon: string;
}

/** 需要优先于普通 Markdown 扩展名匹配的文件名图标。 */
const specialMarkdownIconExpectations: SpecialMarkdownIconExpectation[] = [
  { fileName: 'agents.md', icon: 'vscode-icons:file-type-light-agents' },
  { fileName: 'CLAUDE.md', icon: 'vscode-icons:file-type-claude' },
  { fileName: 'claude.local.md', icon: 'vscode-icons:file-type-claude' },
  { fileName: 'copilot-instructions.md', icon: 'vscode-icons:file-type-light-copilot' },
  { fileName: 'GEMINI.md', icon: 'vscode-icons:file-type-gemini' },
  { fileName: 'warp.md', icon: 'vscode-icons:file-type-light-warp' },
  { fileName: 'LICENSE.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'licence.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'COPYING.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'copying.lesser.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'license-mit.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'license-apache.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'license-gpl.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'license-agpl.md', icon: 'vscode-icons:file-type-license' },
  { fileName: 'UNLICENSE.md', icon: 'vscode-icons:file-type-unlicense' },
  { fileName: 'unlicence.md', icon: 'vscode-icons:file-type-unlicense' }
];

describe('resolveFileIcon', (): void => {
  it('uses the skill icon for skill.md files', (): void => {
    expect(resolveFileIcon('skill.md')).toBe('vscode-icons:file-type-light-skill');
  });

  it('matches skill.md without case sensitivity', (): void => {
    expect(resolveFileIcon('SKILL.md')).toBe('vscode-icons:file-type-light-skill');
  });

  it('keeps regular markdown files on the markdown icon', (): void => {
    expect(resolveFileIcon('README.md')).toBe('vscode-icons:file-type-markdown');
  });

  it('keeps package.json on the npm icon', (): void => {
    expect(resolveFileIcon('package.json')).toBe('vscode-icons:file-type-npm');
  });

  it.each(specialMarkdownIconExpectations)('uses $icon for $fileName', ({ fileName, icon }): void => {
    expect(resolveFileIcon(fileName)).toBe(icon);
  });
});
