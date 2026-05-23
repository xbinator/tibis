# Skill 系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Tibis 引入 Skill 系统，LLM 可通过 `skill` 工具按需加载 SKILL.md 定义的领域专用指令。

**Architecture:** 渲染进程全栈实现。Skill 发现/解析/存储在渲染进程完成，`skill` 工具作为第 10 个内置工具注册。主进程扩展 `FileWatchService` 支持目录监听，通过 IPC 广播 `skill:changed` 事件实现增量更新。

**Tech Stack:** Vue 3 + Pinia + Vitest + Chokidar（主进程）+ localStorage（渲染进程持久化）

---

## 文件结构

| 操作 | 路径 | 职责 |
|------|------|------|
| Create | `src/ai/skill/types.ts` | Skill 类型定义 |
| Create | `src/ai/skill/parser.ts` | SKILL.md frontmatter + body 解析 |
| Create | `src/ai/skill/scanner.ts` | Skill 目录扫描 + 路径规范化 |
| Create | `src/ai/skill/index.ts` | Skill 服务统一出口 |
| Create | `src/ai/tools/builtin/SkillTool/index.ts` | skill 工具注册 + 执行 |
| Create | `src/stores/ai/skill.ts` | Pinia store |
| Modify | `types/ai.d.ts` | `AIToolDefinition.description` 改为 `string \| (() => string)` |
| Modify | `src/ai/tools/stream.ts` | `toTransportTools` 兼容函数式 description |
| Modify | `src/ai/tools/builtin/index.ts` | 集成 skill 工具到 `createBuiltinTools` |
| Modify | `electron/main/modules/file/service.mts` | 新增 `watchDirectory` / `unwatchDirectory` |
| Modify | `electron/main/modules/file/ipc.mts` | 新增 `fs:watchDirectory` / `fs:unwatchDirectory` handler |
| Modify | `electron/preload/index.mts` | 新增 `watchDirectory` / `unwatchDirectory` / `onSkillChanged` |
| Modify | `types/electron-api.d.ts` | 新增 `ElectronAPI` 接口字段 |
| Create | `test/ai/skill/parser.test.ts` | parser 单元测试 |
| Create | `test/ai/skill/scanner.test.ts` | scanner 单元测试 |
| Create | `test/ai/tools/builtin-skill.test.ts` | skill 工具测试 |
| Create | `test/stores/skill.test.ts` | store 测试 |
| Create | `test/electron/fileWatchService.test.ts` | 目录监听测试（追加） |

---

### Task 1: Skill 类型定义

**Files:**
- Create: `src/ai/skill/types.ts`
- Test: `test/ai/skill/types.test.ts`

- [ ] **Step 1: 写失败测试 — 类型导出和默认值**

```typescript
// test/ai/skill/types.test.ts
/**
 * @file types.test.ts
 * @description Skill 类型定义测试。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKILL_MAX_CONTENT_LENGTH,
  type SkillDefinition,
  type SkillScanConfig,
  type SkillSource,
  type SkillChangeEvent
} from '@/ai/skill/types';

describe('Skill types', () => {
  it('exports DEFAULT_SKILL_MAX_CONTENT_LENGTH with correct value', () => {
    expect(DEFAULT_SKILL_MAX_CONTENT_LENGTH).toBe(10000);
  });

  it('SkillSource has expected variants', () => {
    const sources: SkillSource[] = ['builtin', 'project', 'user'];
    expect(sources).toHaveLength(3);
  });

  it('SkillDefinition has required fields', () => {
    const skill: SkillDefinition = {
      name: 'test-skill',
      description: 'A test skill',
      content: '# Test\nContent',
      filePath: '/path/to/SKILL.md',
      dirPath: '/path/to',
      source: 'project',
      enabled: true,
      parsedAt: Date.now()
    };
    expect(skill.name).toBe('test-skill');
    expect(skill.parseError).toBeUndefined();
  });

  it('SkillScanConfig has required fields', () => {
    const config: SkillScanConfig = {
      workspaceRoot: '/workspace',
      customPaths: ['~/skills']
    };
    expect(config.maxContentLength).toBeUndefined();
  });

  it('SkillChangeEvent has required fields', () => {
    const event: SkillChangeEvent = {
      type: 'change',
      filePath: '/path/to/SKILL.md'
    };
    expect(event.type).toBe('change');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ai/skill/types.test.ts`
Expected: FAIL — `@/ai/skill/types` 模块不存在

- [ ] **Step 3: 实现类型定义**

```typescript
// src/ai/skill/types.ts
/**
 * @file types.ts
 * @description Skill 系统类型定义。
 */

/** Skill 来源类型。 */
export type SkillSource = 'builtin' | 'project' | 'user';

/** Skill 目录变更事件类型。 */
export type SkillChangeEventType = 'change' | 'add' | 'unlink';

/** SKILL.md 解析结果。 */
export interface SkillDefinition {
  /** skill 唯一标识，来自 frontmatter name 字段 */
  name: string;
  /** 触发场景描述，来自 frontmatter description 字段 */
  description: string;
  /** 完整指令内容（SKILL.md body 部分） */
  content: string;
  /** SKILL.md 文件绝对路径 */
  filePath: string;
  /** skill 目录绝对路径 */
  dirPath: string;
  /** 来源：builtin（内置）| project（项目目录）| user（用户配置路径） */
  source: SkillSource;
  /** 是否启用 */
  enabled: boolean;
  /** 解析时间戳，用于 UI 展示"上次解析时间" */
  parsedAt: number;
  /** 解析失败时的错误信息 */
  parseError?: string;
}

/** Skill 扫描配置。 */
export interface SkillScanConfig {
  /** 项目工作区根路径 */
  workspaceRoot: string;
  /** 用户自定义 skill 目录路径列表 */
  customPaths: string[];
  /** skill body 最大字符数，默认 10000 */
  maxContentLength?: number;
}

/** Skill 目录变更事件载荷。 */
export interface SkillChangeEvent {
  /** 事件类型 */
  type: SkillChangeEventType;
  /** 受影响的 SKILL.md 文件路径 */
  filePath: string;
}

/** Skill body 默认最大字符数。 */
export const DEFAULT_SKILL_MAX_CONTENT_LENGTH = 10000;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/ai/skill/types.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/ai/skill/types.ts test/ai/skill/types.test.ts
git commit -m "feat(skill): add skill type definitions"
```

---

### Task 2: SKILL.md 解析器

**Files:**
- Create: `src/ai/skill/parser.ts`
- Test: `test/ai/skill/parser.test.ts`

- [ ] **Step 1: 写失败测试 — 解析器核心功能**

```typescript
// test/ai/skill/parser.test.ts
/**
 * @file parser.test.ts
 * @description SKILL.md 解析器测试。
 */
import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '@/ai/skill/parser';

describe('parseSkillMarkdown', () => {
  it('parses valid SKILL.md with frontmatter and body', () => {
    const markdown = `---
name: react-patterns
description: Use when building React components.
---

# React Patterns

Follow these guidelines:
1. Prefer composition over inheritance`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.name).toBe('react-patterns');
    expect(result.description).toBe('Use when building React components.');
    expect(result.content).toContain('# React Patterns');
    expect(result.content).toContain('Prefer composition over inheritance');
    expect(result.filePath).toBe('/path/to/SKILL.md');
    expect(result.dirPath).toBe('/path/to');
    expect(result.enabled).toBe(true);
    expect(result.parseError).toBeUndefined();
  });

  it('returns error when name is missing in frontmatter', () => {
    const markdown = `---
description: A skill without name.
---

# Content`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('name');
  });

  it('returns error when description is missing in frontmatter', () => {
    const markdown = `---
name: my-skill
---

# Content`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('description');
  });

  it('returns error when frontmatter is missing entirely', () => {
    const markdown = '# Just a heading\nNo frontmatter here.';

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('frontmatter');
  });

  it('truncates content exceeding maxContentLength', () => {
    const longContent = 'A'.repeat(15000);
    const markdown = `---
name: long-skill
description: A very long skill.
---

${longContent}`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md', { maxContentLength: 10000 });

    expect(result.content.length).toBeLessThan(11000);
    expect(result.content).toContain('Content truncated');
    expect(result.content).toContain('/path/to/SKILL.md');
  });

  it('does not truncate content within limit', () => {
    const shortContent = 'Short content';
    const markdown = `---
name: short-skill
description: A short skill.
---

${shortContent}`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md', { maxContentLength: 10000 });

    expect(result.content).toBe(shortContent);
    expect(result.content).not.toContain('Content truncated');
  });

  it('handles empty body gracefully', () => {
    const markdown = `---
name: empty-skill
description: No body content.
---
`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.name).toBe('empty-skill');
    expect(result.content).toBe('');
  });

  it('extracts dirPath from filePath correctly', () => {
    const markdown = `---
name: test-skill
description: Test.
---

Content`;

    const result = parseSkillMarkdown(markdown, '/workspace/.agents/skills/test-skill/SKILL.md');

    expect(result.dirPath).toBe('/workspace/.agents/skills/test-skill');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ai/skill/parser.test.ts`
Expected: FAIL — `@/ai/skill/parser` 模块不存在

- [ ] **Step 3: 实现解析器**

```typescript
// src/ai/skill/parser.ts
/**
 * @file parser.ts
 * @description SKILL.md 解析器，提取 frontmatter 元数据和 body 内容。
 */
import { DEFAULT_SKILL_MAX_CONTENT_LENGTH, type SkillDefinition, type SkillSource } from './types';
import path from 'node:path';

/**
 * 解析选项。
 */
interface ParseOptions {
  /** skill 来源，默认 'project' */
  source?: SkillSource;
  /** 内容最大字符数，默认 10000 */
  maxContentLength?: number;
}

/**
 * 从 Markdown 文本中提取 YAML frontmatter。
 * @param markdown - 完整 Markdown 文本
 * @returns frontmatter 文本和 body 文本，无 frontmatter 时返回 null
 */
function extractFrontmatter(markdown: string): { frontmatter: string; body: string } | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return null;
  }
  return { frontmatter: match[1], body: match[2] };
}

/**
 * 解析 YAML frontmatter 文本为键值对。
 * 仅支持简单的 key: value 格式，不处理嵌套。
 * @param frontmatter - frontmatter 文本
 * @returns 键值对映射
 */
function parseFrontmatter(frontmatter: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

/**
 * 截断超长内容并附加提示。
 * @param content - 原始内容
 * @param maxLength - 最大字符数
 * @param filePath - 文件路径，用于截断提示
 * @returns 处理后的内容
 */
function truncateContent(content: string, maxLength: number, filePath: string): string {
  if (content.length <= maxLength) {
    return content;
  }
  const truncationNotice = `\n[Content truncated at ${maxLength} chars, full content at: ${filePath}]`;
  return content.slice(0, maxLength - truncationNotice.length) + truncationNotice;
}

/**
 * 解析 SKILL.md 文件内容为 SkillDefinition。
 * @param markdown - SKILL.md 文件内容
 * @param filePath - SKILL.md 文件绝对路径
 * @param options - 解析选项
 * @returns 解析结果（含错误信息时 parseError 不为空）
 */
export function parseSkillMarkdown(
  markdown: string,
  filePath: string,
  options: ParseOptions = {}
): SkillDefinition {
  const source: SkillSource = options.source ?? 'project';
  const maxContentLength = options.maxContentLength ?? DEFAULT_SKILL_MAX_CONTENT_LENGTH;
  const dirPath = path.dirname(filePath);
  const parsedAt = Date.now();

  const extracted = extractFrontmatter(markdown);
  if (!extracted) {
    return {
      name: '',
      description: '',
      content: '',
      filePath,
      dirPath,
      source,
      enabled: true,
      parsedAt,
      parseError: 'Missing YAML frontmatter. SKILL.md must start with --- delimited frontmatter containing name and description.'
    };
  }

  const fm = parseFrontmatter(extracted.frontmatter);
  const name = fm.name?.trim();
  const description = fm.description?.trim();

  if (!name) {
    return {
      name: '',
      description: description ?? '',
      content: '',
      filePath,
      dirPath,
      source,
      enabled: true,
      parsedAt,
      parseError: 'Missing required frontmatter field: name'
    };
  }

  if (!description) {
    return {
      name,
      description: '',
      content: '',
      filePath,
      dirPath,
      source,
      enabled: true,
      parsedAt,
      parseError: 'Missing required frontmatter field: description'
    };
  }

  const rawContent = extracted.body.trim();
  const content = truncateContent(rawContent, maxContentLength, filePath);

  return {
    name,
    description,
    content,
    filePath,
    dirPath,
    source,
    enabled: true,
    parsedAt
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/ai/skill/parser.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/ai/skill/parser.ts test/ai/skill/parser.test.ts
git commit -m "feat(skill): add SKILL.md parser with frontmatter extraction"
```

---

### Task 3: Skill 扫描器

**Files:**
- Create: `src/ai/skill/scanner.ts`
- Test: `test/ai/skill/scanner.test.ts`

- [ ] **Step 1: 写失败测试 — 扫描器核心功能**

```typescript
// test/ai/skill/scanner.test.ts
/**
 * @file scanner.test.ts
 * @description Skill 扫描器测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { scanSkills, normalizePath } from '@/ai/skill/scanner';
import type { SkillScanConfig } from '@/ai/skill/types';

/**
 * 创建 mock electronAPI。
 * @param files - 文件系统映射（路径 → 内容）
 * @param directories - 目录映射（路径 → 子条目列表）
 * @returns mock electronAPI
 */
function createMockElectronAPI(
  files: Record<string, string> = {},
  directories: Record<string, Array<{ name: string; isDirectory: boolean }>> = {}
) {
  return {
    readFile: vi.fn(async (filePath: string) => {
      const content = files[filePath];
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return { content, fileName: 'SKILL.md', ext: 'md' };
    }),
    readWorkspaceDirectory: vi.fn(async (options: { path: string }) => {
      const entries = directories[options.path];
      if (entries === undefined) {
        throw new Error(`Directory not found: ${options.path}`);
      }
      return { entries, total: entries.length };
    }),
    getPathStatus: vi.fn(async (targetPath: string) => {
      if (files[targetPath] !== undefined) {
        return { exists: true, isFile: true, isDirectory: false };
      }
      if (directories[targetPath] !== undefined) {
        return { exists: true, isFile: false, isDirectory: true };
      }
      return { exists: false, isFile: false, isDirectory: false };
    })
  };
}

describe('normalizePath', () => {
  it('expands ~/ to home directory', () => {
    const result = normalizePath('~/my-skills', '/Users/test');
    expect(result).toBe('/Users/test/my-skills');
  });

  it('resolves relative path against workspace root', () => {
    const result = normalizePath('./shared-skills', '/workspace');
    expect(result).toBe('/workspace/shared-skills');
  });

  it('returns absolute path unchanged', () => {
    const result = normalizePath('/absolute/path', '/workspace');
    expect(result).toBe('/absolute/path');
  });
});

describe('scanSkills', () => {
  it('discovers skills from project .agents/skills/ directory', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/workspace/.agents/skills/react-patterns/SKILL.md': '---\nname: react-patterns\ndescription: React patterns.\n---\n\n# React Patterns\nContent here.',
        '/workspace/.agents/skills/api-design/SKILL.md': '---\nname: api-design\ndescription: API design.\n---\n\n# API Design\nContent here.'
      },
      {
        '/workspace/.agents/skills': [
          { name: 'react-patterns', isDirectory: true },
          { name: 'api-design', isDirectory: true }
        ],
        '/workspace/.agents/skills/react-patterns': [
          { name: 'SKILL.md', isDirectory: false }
        ],
        '/workspace/.agents/skills/api-design': [
          { name: 'SKILL.md', isDirectory: false }
        ]
      }
    );

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace',
      customPaths: []
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('react-patterns');
    expect(skills[1].name).toBe('api-design');
  });

  it('discovers skills from custom paths', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/Users/test/my-skills/custom-skill/SKILL.md': '---\nname: custom-skill\ndescription: Custom skill.\n---\n\n# Custom'
      },
      {
        '/Users/test/my-skills': [
          { name: 'custom-skill', isDirectory: true }
        ],
        '/Users/test/my-skills/custom-skill': [
          { name: 'SKILL.md', isDirectory: false }
        ]
      }
    );

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace',
      customPaths: ['~/my-skills']
    };

    const skills = await scanSkills(config, mockAPI, '/Users/test');

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('custom-skill');
    expect(skills[0].source).toBe('user');
  });

  it('user path skills override project skills with same name', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/workspace/.agents/skills/shared/SKILL.md': '---\nname: shared\ndescription: Project version.\n---\n\n# Project',
        '/Users/test/my-skills/shared/SKILL.md': '---\nname: shared\ndescription: User version.\n---\n\n# User'
      },
      {
        '/workspace/.agents/skills': [
          { name: 'shared', isDirectory: true }
        ],
        '/workspace/.agents/skills/shared': [
          { name: 'SKILL.md', isDirectory: false }
        ],
        '/Users/test/my-skills': [
          { name: 'shared', isDirectory: true }
        ],
        '/Users/test/my-skills/shared': [
          { name: 'SKILL.md', isDirectory: false }
        ]
      }
    );

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace',
      customPaths: ['~/my-skills']
    };

    const skills = await scanSkills(config, mockAPI, '/Users/test');

    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('User version.');
    expect(skills[0].source).toBe('user');
  });

  it('returns empty array when no skill directories exist', async () => {
    const mockAPI = createMockElectronAPI({}, {});

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace',
      customPaths: []
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toEqual([]);
  });

  it('skips skills with parse errors but includes them with parseError field', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/workspace/.agents/skills/bad-skill/SKILL.md': '# No frontmatter',
        '/workspace/.agents/skills/good-skill/SKILL.md': '---\nname: good-skill\ndescription: Good skill.\n---\n\n# Good'
      },
      {
        '/workspace/.agents/skills': [
          { name: 'bad-skill', isDirectory: true },
          { name: 'good-skill', isDirectory: true }
        ],
        '/workspace/.agents/skills/bad-skill': [
          { name: 'SKILL.md', isDirectory: false }
        ],
        '/workspace/.agents/skills/good-skill': [
          { name: 'SKILL.md', isDirectory: false }
        ]
      }
    );

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace',
      customPaths: []
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toHaveLength(2);
    const badSkill = skills.find((s) => s.name === '');
    const goodSkill = skills.find((s) => s.name === 'good-skill');
    expect(badSkill?.parseError).toBeDefined();
    expect(goodSkill?.parseError).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ai/skill/scanner.test.ts`
Expected: FAIL — `@/ai/skill/scanner` 模块不存在

- [ ] **Step 3: 实现扫描器**

```typescript
// src/ai/skill/scanner.ts
/**
 * @file scanner.ts
 * @description Skill 目录扫描器，发现并解析 SKILL.md 文件。
 */
import type { SkillDefinition, SkillScanConfig } from './types';
import { parseSkillMarkdown } from './parser';

/**
 * 扫描器依赖的 electronAPI 接口。
 * 仅声明扫描所需的方法，便于测试注入。
 */
export interface SkillScannerAPI {
  /** 读取文件内容 */
  readFile: (filePath: string) => Promise<{ content: string }>;
  /** 读取工作区目录 */
  readWorkspaceDirectory: (options: { path: string }) => Promise<{ entries: Array<{ name: string; isDirectory: boolean }>; total: number }>;
  /** 获取路径状态 */
  getPathStatus?: (targetPath: string) => Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }>;
}

/**
 * 规范化路径：展开 ~/、解析相对路径。
 * @param rawPath - 原始路径
 * @param workspaceRoot - 工作区根路径
 * @param homeDir - 用户主目录（可选，用于 ~/ 展开）
 * @returns 规范化后的绝对路径
 */
export function normalizePath(rawPath: string, workspaceRoot: string, homeDir?: string): string {
  if (rawPath.startsWith('~/')) {
    if (!homeDir) {
      return rawPath;
    }
    return homeDir + rawPath.slice(1);
  }

  if (rawPath.startsWith('./') || (!rawPath.startsWith('/') && !rawPath.startsWith('~/'))) {
    return workspaceRoot + '/' + rawPath.replace(/^\.\//, '');
  }

  return rawPath;
}

/**
 * 扫描指定目录下的 SKILL.md 文件。
 * @param dirPath - 要扫描的目录绝对路径
 * @param source - skill 来源标记
 * @param api - electronAPI 实例
 * @param maxContentLength - 内容最大长度
 * @returns 解析后的 SkillDefinition 数组
 */
async function scanDirectory(
  dirPath: string,
  source: SkillDefinition['source'],
  api: SkillScannerAPI,
  maxContentLength?: number
): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];

  try {
    const { entries } = await api.readWorkspaceDirectory({ path: dirPath });

    for (const entry of entries) {
      if (!entry.isDirectory) {
        continue;
      }

      const skillDirPath = dirPath + '/' + entry.name;
      const skillFilePath = skillDirPath + '/SKILL.md';

      try {
        const { content } = await api.readFile(skillFilePath);
        const skill = parseSkillMarkdown(content, skillFilePath, { source, maxContentLength });
        skills.push(skill);
      } catch {
        // 目录下没有 SKILL.md，跳过
      }
    }
  } catch {
    // 目录不存在或不可读，跳过
  }

  return skills;
}

/**
 * 扫描所有来源的 Skill。
 * 扫描顺序：项目目录 → 用户配置路径（用户路径优先级更高，同名覆盖项目）。
 * @param config - 扫描配置
 * @param api - electronAPI 实例
 * @param homeDir - 用户主目录（可选，用于 ~/ 展开）
 * @returns 去重后的 SkillDefinition 数组
 */
export async function scanSkills(
  config: SkillScanConfig,
  api: SkillScannerAPI,
  homeDir?: string
): Promise<SkillDefinition[]> {
  const allSkills: SkillDefinition[] = [];
  const maxContentLength = config.maxContentLength;

  // 1. 扫描项目目录
  const projectSkillsDir = config.workspaceRoot + '/.agents/skills';
  const projectSkills = await scanDirectory(projectSkillsDir, 'project', api, maxContentLength);
  allSkills.push(...projectSkills);

  // 2. 扫描用户自定义路径
  for (const rawPath of config.customPaths) {
    const normalizedPath = normalizePath(rawPath, config.workspaceRoot, homeDir);
    const userSkills = await scanDirectory(normalizedPath, 'user', api, maxContentLength);
    allSkills.push(...userSkills);
  }

  // 3. 去重：同名 skill 后者覆盖前者（用户路径后扫描，优先级更高）
  const skillMap = new Map<string, SkillDefinition>();
  for (const skill of allSkills) {
    const key = skill.name || skill.filePath;
    skillMap.set(key, skill);
  }

  return Array.from(skillMap.values());
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/ai/skill/scanner.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/ai/skill/scanner.ts test/ai/skill/scanner.test.ts
git commit -m "feat(skill): add skill scanner with directory discovery and path normalization"
```

---

### Task 4: Skill 服务统一出口

**Files:**
- Create: `src/ai/skill/index.ts`

- [ ] **Step 1: 创建统一出口**

```typescript
// src/ai/skill/index.ts
/**
 * @file index.ts
 * @description Skill 服务统一出口。
 */
export { parseSkillMarkdown } from './parser';
export { scanSkills, normalizePath, type SkillScannerAPI } from './scanner';
export {
  DEFAULT_SKILL_MAX_CONTENT_LENGTH,
  type SkillDefinition,
  type SkillScanConfig,
  type SkillSource,
  type SkillChangeEvent,
  type SkillChangeEventType
} from './types';
```

- [ ] **Step 2: 提交**

```bash
git add src/ai/skill/index.ts
git commit -m "feat(skill): add skill service barrel export"
```

---

### Task 5: AIToolDefinition.description 支持动态函数

**Files:**
- Modify: `types/ai.d.ts` — `AIToolDefinition.description` 类型
- Modify: `src/ai/tools/stream.ts` — `toTransportTools` 兼容
- Test: `test/ai/tools/stream.test.ts` — 追加测试

- [ ] **Step 1: 写失败测试 — 动态 description**

在 `test/ai/tools/stream.test.ts` 文件末尾追加：

```typescript
describe('toTransportTools with dynamic description', () => {
  it('resolves function description to string', () => {
    let counter = 0;
    const dynamicTool: AIToolExecutor = {
      definition: {
        name: 'dynamic',
        description: () => `Dynamic description ${++counter}`,
        source: 'builtin',
        riskLevel: 'read',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      },
      async execute() {
        return createToolSuccessResult('dynamic', {});
      }
    };

    const result = toTransportTools([dynamicTool]);
    expect(result[0].description).toBe('Dynamic description 1');
    // 再次调用应重新求值
    const result2 = toTransportTools([dynamicTool]);
    expect(result2[0].description).toBe('Dynamic description 2');
  });

  it('handles static string description unchanged', () => {
    const staticTool: AIToolExecutor = {
      definition: {
        name: 'static',
        description: 'Static description',
        source: 'builtin',
        riskLevel: 'read',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      },
      async execute() {
        return createToolSuccessResult('static', {});
      }
    };

    const result = toTransportTools([staticTool]);
    expect(result[0].description).toBe('Static description');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ai/tools/stream.test.ts`
Expected: FAIL — TypeScript 类型错误，`description` 不接受函数

- [ ] **Step 3: 修改 AIToolDefinition 类型**

在 `types/ai.d.ts` 中，将 `AIToolDefinition.description` 从 `string` 改为 `string | (() => string)`：

```typescript
// 修改前：
  /** 工具描述。 */
  description: string;

// 修改后：
  /** 工具描述，支持静态字符串或动态生成函数。 */
  description: string | (() => string);
```

- [ ] **Step 4: 修改 toTransportTools 兼容函数式 description**

在 `src/ai/tools/stream.ts` 中修改 `toTransportTools`：

```typescript
// 修改前：
export function toTransportTools(tools: AIToolExecutor[]): AITransportTool[] {
  return tools.map((item) => ({
    name: item.definition.name,
    description: item.definition.description,
    parameters: item.definition.parameters
  }));
}

// 修改后：
export function toTransportTools(tools: AIToolExecutor[]): AITransportTool[] {
  return tools.map((item) => ({
    name: item.definition.name,
    description: typeof item.definition.description === 'function' ? item.definition.description() : item.definition.description,
    parameters: item.definition.parameters
  }));
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run test/ai/tools/stream.test.ts`
Expected: PASS

- [ ] **Step 6: 运行全量测试确认无回归**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add types/ai.d.ts src/ai/tools/stream.ts test/ai/tools/stream.test.ts
git commit -m "feat(tools): support dynamic description in AIToolDefinition"
```

---

### Task 6: Skill 工具实现

**Files:**
- Create: `src/ai/tools/builtin/SkillTool/index.ts`
- Test: `test/ai/tools/builtin-skill.test.ts`

- [ ] **Step 1: 写失败测试 — skill 工具执行**

```typescript
// test/ai/tools/builtin-skill.test.ts
/**
 * @file builtin-skill.test.ts
 * @description Skill 工具测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { createSkillTool, SKILL_TOOL_NAME } from '@/ai/tools/builtin/SkillTool';
import type { SkillDefinition } from '@/ai/skill/types';

/**
 * 创建 mock skill store。
 * @param skills - 可用 skill 列表
 * @returns mock store
 */
function createMockSkillStore(skills: SkillDefinition[] = []) {
  return {
    getEnabledSkills: vi.fn(() => skills),
    getSkillByName: vi.fn((name: string) => skills.find((s) => s.name === name)),
    initialized: true
  };
}

const sampleSkill: SkillDefinition = {
  name: 'react-patterns',
  description: 'Use when building React components.',
  content: '# React Patterns\n\n1. Prefer composition over inheritance',
  filePath: '/workspace/.agents/skills/react-patterns/SKILL.md',
  dirPath: '/workspace/.agents/skills/react-patterns',
  source: 'project',
  enabled: true,
  parsedAt: Date.now()
};

describe('SkillTool', () => {
  it('has correct tool name', () => {
    expect(SKILL_TOOL_NAME).toBe('skill');
  });

  it('definition has read risk level', () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);
    expect(tool.definition.riskLevel).toBe('read');
  });

  it('definition has dynamic description listing available skills', () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);

    const desc = typeof tool.definition.description === 'function'
      ? tool.definition.description()
      : tool.definition.description;

    expect(desc).toContain('react-patterns');
    expect(desc).toContain('Use when building React components.');
  });

  it('definition shows no skills available when list is empty', () => {
    const store = createMockSkillStore([]);
    const tool = createSkillTool(store);

    const desc = typeof tool.definition.description === 'function'
      ? tool.definition.description()
      : tool.definition.description;

    expect(desc).toContain('No skills available');
  });

  it('executes and returns skill content wrapped in skill_content tags', async () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);

    const result = await tool.execute({ name: 'react-patterns' });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success');

    expect(result.data).toContain('<skill_content name="react-patterns">');
    expect(result.data).toContain('Prefer composition over inheritance');
    expect(result.data).toContain('</skill_content>');
  });

  it('returns failure when skill name not found', async () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);

    const result = await tool.execute({ name: 'nonexistent' });

    expect(result.status).toBe('failure');
    if (result.status !== 'failure') throw new Error('Expected failure');

    expect(result.error.message).toContain('not found');
    expect(result.error.message).toContain('react-patterns');
  });

  it('does not require active document', () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);
    expect(tool.definition.requiresActiveDocument).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ai/tools/builtin-skill.test.ts`
Expected: FAIL — `@/ai/tools/builtin/SkillTool` 模块不存在

- [ ] **Step 3: 实现 Skill 工具**

```typescript
// src/ai/tools/builtin/SkillTool/index.ts
/**
 * @file SkillTool/index.ts
 * @description Skill 工具实现，LLM 通过此工具按需加载 Skill 指令。
 */
import type { AIToolExecutor } from 'types/ai';
import type { SkillDefinition } from '@/ai/skill/types';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** Skill 工具名称。 */
export const SKILL_TOOL_NAME = 'skill';

/**
 * Skill store 接口，仅声明 SkillTool 所需的方法。
 */
interface SkillStoreLike {
  /** 获取已启用的 skill 列表 */
  getEnabledSkills: () => SkillDefinition[];
  /** 按名称查找 skill */
  getSkillByName: (name: string) => SkillDefinition | undefined;
  /** 是否已完成初始化 */
  initialized: boolean;
}

/**
 * 生成 skill 工具的动态 description。
 * @param store - skill store 实例
 * @returns description 字符串
 */
function buildSkillDescription(store: SkillStoreLike): string {
  const skills = store.getEnabledSkills();

  if (skills.length === 0) {
    return 'Load a skill by name to get specialized instructions. No skills available. Skills can be added by placing SKILL.md files in .agents/skills/ directories.';
  }

  const skillLines = skills
    .filter((s) => !s.parseError)
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');

  return `Load a skill by name to get specialized instructions. Available skills:\n${skillLines}\n\nCall this tool with the skill name to load its full instructions.`;
}

/**
 * 创建 Skill 工具执行器。
 * @param store - skill store 实例
 * @returns 工具执行器
 */
export function createSkillTool(store: SkillStoreLike): AIToolExecutor<{ name: string }, string> {
  return {
    definition: {
      name: SKILL_TOOL_NAME,
      description: () => buildSkillDescription(store),
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the skill to load.'
          }
        },
        required: ['name'],
        additionalProperties: false
      }
    },
    async execute(input: { name: string }) {
      const skill = store.getSkillByName(input.name);

      if (!skill || skill.parseError) {
        const available = store
          .getEnabledSkills()
          .filter((s) => !s.parseError)
          .map((s) => s.name)
          .join(', ');

        return createToolFailureResult(
          SKILL_TOOL_NAME,
          'TOOL_NOT_FOUND',
          `Skill '${input.name}' not found. Available skills: ${available || 'none'}`
        );
      }

      const content = `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`;
      return createToolSuccessResult(SKILL_TOOL_NAME, content);
    }
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/ai/tools/builtin-skill.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/ai/tools/builtin/SkillTool/index.ts test/ai/tools/builtin-skill.test.ts
git commit -m "feat(skill): add skill tool with dynamic description and execution"
```

---

### Task 7: 集成 Skill 工具到 createBuiltinTools

**Files:**
- Modify: `src/ai/tools/builtin/index.ts`
- Test: `test/ai/tools/builtin-index.test.ts` — 追加测试

- [ ] **Step 1: 写失败测试 — createBuiltinTools 包含 skill 工具**

在 `test/ai/tools/builtin-index.test.ts` 追加：

```typescript
import { vi } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';

describe('createBuiltinTools with skill tool', () => {
  it('includes skill tool when skillStore is provided and initialized', () => {
    const mockSkillStore = {
      getEnabledSkills: vi.fn(() => []),
      getSkillByName: vi.fn(() => undefined),
      initialized: true
    };

    const tools = createBuiltinTools({
      confirm: { confirm: async () => true },
      skillStore: mockSkillStore
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeDefined();
  });

  it('excludes skill tool when skillStore is not provided', () => {
    const tools = createBuiltinTools({
      confirm: { confirm: async () => true }
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeUndefined();
  });

  it('excludes skill tool when skillStore is not initialized', () => {
    const mockSkillStore = {
      getEnabledSkills: vi.fn(() => []),
      getSkillByName: vi.fn(() => undefined),
      initialized: false
    };

    const tools = createBuiltinTools({
      confirm: { confirm: async () => true },
      skillStore: mockSkillStore
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ai/tools/builtin-index.test.ts`
Expected: FAIL — `skillStore` 属性在 `CreateBuiltinToolsOptions` 中不存在

- [ ] **Step 3: 修改 createBuiltinTools 集成 skill 工具**

在 `src/ai/tools/builtin/index.ts` 中：

1. 新增 import：
```typescript
import { createSkillTool, SKILL_TOOL_NAME } from './SkillTool';
```

2. 新增 re-export：
```typescript
export { SKILL_TOOL_NAME } from './SkillTool';
```

3. 在 `CreateBuiltinToolsOptions` 接口追加：
```typescript
/** Skill store 实例，提供后注册 skill 工具 */
skillStore?: {
  getEnabledSkills: () => Array<import('@/ai/skill/types').SkillDefinition>;
  getSkillByName: (name: string) => import('@/ai/skill/types').SkillDefinition | undefined;
  initialized: boolean;
};
```

4. 在 `createBuiltinTools` 函数末尾，`return` 之前追加 skill 工具注册：
```typescript
  // 注册 skill 工具（仅在 store 已初始化时）
  if (options.skillStore?.initialized) {
    const skillTool = createSkillTool(options.skillStore);
    return [...readonlyTools, ...writableTools, skillTool];
  }
```

5. 在 `DEFAULT_BUILTIN_READONLY_TOOL_NAMES` 数组末尾追加 `'skill' as const`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/ai/tools/builtin-index.test.ts`
Expected: PASS

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/ai/tools/builtin/index.ts test/ai/tools/builtin-index.test.ts
git commit -m "feat(skill): integrate skill tool into createBuiltinTools"
```

---

### Task 8: Skill Pinia Store

**Files:**
- Create: `src/stores/ai/skill.ts`
- Test: `test/stores/skill.test.ts`

- [ ] **Step 1: 写失败测试 — Store 核心功能**

```typescript
// test/stores/skill.test.ts
/**
 * @file skill.test.ts
 * @description Skill Pinia Store 测试。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillStore } from '@/stores/ai/skill';
import type { SkillDefinition } from '@/ai/skill/types';

const sampleSkill: SkillDefinition = {
  name: 'react-patterns',
  description: 'Use when building React components.',
  content: '# React Patterns\n\n1. Prefer composition',
  filePath: '/workspace/.agents/skills/react-patterns/SKILL.md',
  dirPath: '/workspace/.agents/skills/react-patterns',
  source: 'project',
  enabled: true,
  parsedAt: Date.now()
};

const sampleSkill2: SkillDefinition = {
  name: 'api-design',
  description: 'Use when designing APIs.',
  content: '# API Design\n\nREST conventions',
  filePath: '/workspace/.agents/skills/api-design/SKILL.md',
  dirPath: '/workspace/.agents/skills/api-design',
  source: 'project',
  enabled: true,
  parsedAt: Date.now()
};

describe('useSkillStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with empty skills', () => {
    const store = useSkillStore();
    expect(store.skills).toEqual([]);
    expect(store.initialized).toBe(false);
  });

  it('getSkillByName returns matching skill', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill, sampleSkill2] });

    expect(store.getSkillByName('react-patterns')).toEqual(sampleSkill);
    expect(store.getSkillByName('nonexistent')).toBeUndefined();
  });

  it('getEnabledSkills returns only enabled skills without parse errors', () => {
    const store = useSkillStore();
    const disabledSkill: SkillDefinition = { ...sampleSkill2, enabled: false };
    const errorSkill: SkillDefinition = { ...sampleSkill, name: 'bad', parseError: 'Missing name' };
    store.$patch({ skills: [sampleSkill, disabledSkill, errorSkill] });

    const enabled = store.getEnabledSkills();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('react-patterns');
  });

  it('toggleSkill toggles enabled state', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill] });

    store.toggleSkill('react-patterns');
    expect(store.skills[0].enabled).toBe(false);

    store.toggleSkill('react-patterns');
    expect(store.skills[0].enabled).toBe(true);
  });

  it('handleSkillChange updates skill on add/change event', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill] });

    const updatedSkill: SkillDefinition = {
      ...sampleSkill,
      description: 'Updated description.',
      content: '# Updated content'
    };
    store.handleSkillChange('change', updatedSkill);

    expect(store.skills[0].description).toBe('Updated description.');
  });

  it('handleSkillChange adds new skill on add event', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill] });

    store.handleSkillChange('add', sampleSkill2);

    expect(store.skills).toHaveLength(2);
    expect(store.skills[1].name).toBe('api-design');
  });

  it('handleSkillChange removes skill on unlink event', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill, sampleSkill2] });

    store.handleSkillChange('unlink', { filePath: sampleSkill.filePath } as SkillDefinition);

    expect(store.skills).toHaveLength(1);
    expect(store.skills[0].name).toBe('api-design');
  });

  it('parseErrors tracks skills with parse errors', () => {
    const store = useSkillStore();
    const errorSkill: SkillDefinition = {
      name: '',
      description: '',
      content: '',
      filePath: '/bad/SKILL.md',
      dirPath: '/bad',
      source: 'project',
      enabled: true,
      parsedAt: Date.now(),
      parseError: 'Missing frontmatter'
    };
    store.$patch({ skills: [sampleSkill, errorSkill] });

    expect(store.parseErrors.size).toBe(1);
    expect(store.parseErrors.get('/bad/SKILL.md')).toBe('Missing frontmatter');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/stores/skill.test.ts`
Expected: FAIL — `@/stores/ai/skill` 模块不存在

- [ ] **Step 3: 实现 Skill Store**

```typescript
// src/stores/ai/skill.ts
/**
 * @file skill.ts
 * @description Skill Pinia Store，管理 skill 列表、启用状态和扫描配置。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { SkillDefinition, SkillScanConfig } from '@/ai/skill/types';
import { DEFAULT_SKILL_MAX_CONTENT_LENGTH, scanSkills, type SkillScannerAPI } from '@/ai/skill';
import { local } from '@/shared/storage/base';

/** localStorage 持久化键名。 */
const STORAGE_KEY_DISABLED_NAMES = 'skill.disabledNames';
const STORAGE_KEY_CUSTOM_PATHS = 'skill.customPaths';

/**
 * Skill Pinia Store。
 */
export const useSkillStore = defineStore('skill', () => {
  /** 已发现的所有 skill。 */
  const skills = ref<SkillDefinition[]>([]);

  /** 是否已完成初始化扫描。 */
  const initialized = ref(false);

  /** 初始化 Promise，用于等待扫描完成。 */
  let initPromise: Promise<void> | null = null;

  /** 扫描配置。 */
  const scanConfig = ref<SkillScanConfig>({
    workspaceRoot: '',
    customPaths: loadFromStorage<string[]>(STORAGE_KEY_CUSTOM_PATHS, [])
  });

  /** 解析失败的 skill 及错误信息。 */
  const parseErrors = computed(() => {
    const errors = new Map<string, string>();
    for (const skill of skills.value) {
      if (skill.parseError) {
        errors.set(skill.filePath, skill.parseError);
      }
    }
    return errors;
  });

  /**
   * 按名称查找 skill。
   * @param name - skill 名称
   * @returns 匹配的 skill 或 undefined
   */
  function getSkillByName(name: string): SkillDefinition | undefined {
    return skills.value.find((s) => s.name === name);
  }

  /**
   * 获取已启用且无解析错误的 skill 列表。
   * @returns 可用 skill 列表
   */
  function getEnabledSkills(): SkillDefinition[] {
    return skills.value.filter((s) => s.enabled && !s.parseError);
  }

  /**
   * 切换 skill 启用/禁用状态。
   * @param name - skill 名称
   */
  function toggleSkill(name: string): void {
    const skill = skills.value.find((s) => s.name === name);
    if (skill) {
      skill.enabled = !skill.enabled;
      persistDisabledNames();
    }
  }

  /**
   * 处理 skill 目录变更事件（增量更新）。
   * @param type - 事件类型
   * @param updatedSkill - 解析后的 skill（add/change 时提供）
   */
  function handleSkillChange(type: 'change' | 'add' | 'unlink', updatedSkill: SkillDefinition): void {
    const index = skills.value.findIndex((s) => s.filePath === updatedSkill.filePath);

    if (type === 'unlink') {
      if (index !== -1) {
        skills.value.splice(index, 1);
      }
      return;
    }

    // add 或 change
    if (index !== -1) {
      skills.value[index] = updatedSkill;
    } else {
      skills.value.push(updatedSkill);
    }
  }

  /**
   * 初始化：扫描 skill 目录。
   * @param workspaceRoot - 工作区根路径
   * @param api - electronAPI 实例
   * @param homeDir - 用户主目录
   */
  async function init(workspaceRoot: string, api: SkillScannerAPI, homeDir?: string): Promise<void> {
    if (initPromise) {
      return initPromise;
    }

    scanConfig.value.workspaceRoot = workspaceRoot;

    initPromise = (async () => {
      try {
        const config: SkillScanConfig = {
          workspaceRoot,
          customPaths: scanConfig.value.customPaths,
          maxContentLength: DEFAULT_SKILL_MAX_CONTENT_LENGTH
        };

        const discovered = await scanSkills(config, api, homeDir);

        // 应用持久化的禁用状态
        const disabledNames = loadFromStorage<string[]>(STORAGE_KEY_DISABLED_NAMES, []);
        for (const skill of discovered) {
          if (disabledNames.includes(skill.name)) {
            skill.enabled = false;
          }
        }

        skills.value = discovered;
        initialized.value = true;
      } catch (error: unknown) {
        console.error('Skill scan failed:', error);
        initialized.value = true;
      }
    })();

    return initPromise;
  }

  /**
   * 等待初始化完成。
   */
  async function waitForInit(): Promise<void> {
    if (initialized.value) return;
    if (initPromise) await initPromise;
  }

  /**
   * 添加自定义搜索路径。
   * @param path - 路径
   */
  function addCustomPath(path: string): void {
    if (!scanConfig.value.customPaths.includes(path)) {
      scanConfig.value.customPaths.push(path);
      persistCustomPaths();
    }
  }

  /**
   * 移除自定义搜索路径。
   * @param path - 路径
   */
  function removeCustomPath(path: string): void {
    const index = scanConfig.value.customPaths.indexOf(path);
    if (index !== -1) {
      scanConfig.value.customPaths.splice(index, 1);
      persistCustomPaths();
    }
  }

  /** 持久化禁用名称列表。 */
  function persistDisabledNames(): void {
    const disabledNames = skills.value.filter((s) => !s.enabled).map((s) => s.name);
    local.setItem(STORAGE_KEY_DISABLED_NAMES, disabledNames);
  }

  /** 持久化自定义路径。 */
  function persistCustomPaths(): void {
    local.setItem(STORAGE_KEY_CUSTOM_PATHS, scanConfig.value.customPaths);
  }

  return {
    skills,
    initialized,
    scanConfig,
    parseErrors,
    getSkillByName,
    getEnabledSkills,
    toggleSkill,
    handleSkillChange,
    init,
    waitForInit,
    addCustomPath,
    removeCustomPath
  };
});

/**
 * 从 localStorage 加载数据。
 * @param key - 存储键名
 * @param defaults - 默认值
 * @returns 加载的数据或默认值
 */
function loadFromStorage<T>(key: string, defaults: T): T {
  const saved = local.getItem<unknown>(key);
  return saved !== null && saved !== undefined ? (saved as T) : defaults;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/stores/skill.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/stores/ai/skill.ts test/stores/skill.test.ts
git commit -m "feat(skill): add skill Pinia store with scan, toggle, and persistence"
```

---

### Task 9: 扩展 FileWatchService 支持目录监听

**Files:**
- Modify: `electron/main/modules/file/service.mts`
- Modify: `electron/main/modules/file/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`
- Test: `test/electron/fileWatchService.test.ts` — 追加测试

- [ ] **Step 1: 写失败测试 — 目录监听**

在 `test/electron/fileWatchService.test.ts` 中追加：

```typescript
describe('FileWatchService - watchDirectory', () => {
  it('watchDirectory method exists on service', () => {
    // 验证 service 实例有 watchDirectory 方法
    const { fileWatchService } = await import('electron/main/modules/file/service');
    expect(typeof fileWatchService.watchDirectory).toBe('function');
    expect(typeof fileWatchService.unwatchDirectory).toBe('function');
  });
});
```

> 注意：主进程模块的测试需要 electron 环境模拟。此处仅验证方法存在性。完整集成测试在应用运行时验证。

- [ ] **Step 2: 扩展 FileWatchService**

在 `electron/main/modules/file/service.mts` 中：

1. 新增 `directoryWatchers` Map：
```typescript
/** 按目录路径保存已创建的目录 watcher。 */
private readonly directoryWatchers = new Map<string, FileWatcher>();
```

2. 新增 `watchDirectory` 方法：
```typescript
/**
 * 注册指定目录的监听，匹配 glob 模式的文件变化时广播 skill:changed 事件。
 * @param dirPath - 需要监听的目录路径
 * @param globPattern - 文件匹配模式，默认 '**/*.md'
 */
async watchDirectory(dirPath: string, globPattern: string = '**/*.md'): Promise<void> {
  const watcherKey = `${dirPath}:${globPattern}`;
  if (this.directoryWatchers.has(watcherKey)) return;

  const watcher = chokidar.watch(dirPath, {
    persistent: true,
    depth: 3,
    ignored: ['**/node_modules/**', '**/.git/**'],
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100
    }
  });

  watcher.on('change', async (changedPath: string) => {
    try {
      const content = await fsPromises.readFile(changedPath, 'utf-8');
      this.notifyWindowsSkill('change', changedPath, content);
    } catch (error: unknown) {
      console.error('DirectoryWatchService read error:', error);
    }
  });

  watcher.on('add', async (addedPath: string) => {
    try {
      const content = await fsPromises.readFile(addedPath, 'utf-8');
      this.notifyWindowsSkill('add', addedPath, content);
    } catch (error: unknown) {
      console.error('DirectoryWatchService read error on add:', error);
    }
  });

  watcher.on('unlink', (removedPath: string) => {
    this.notifyWindowsSkill('unlink', removedPath);
  });

  this.directoryWatchers.set(watcherKey, watcher);
}
```

3. 新增 `unwatchDirectory` 方法：
```typescript
/**
 * 停止监听指定目录。
 * @param dirPath - 需要停止监听的目录路径
 * @param globPattern - 文件匹配模式
 */
async unwatchDirectory(dirPath: string, globPattern: string = '**/*.md'): Promise<void> {
  const watcherKey = `${dirPath}:${globPattern}`;
  const watcher = this.directoryWatchers.get(watcherKey);
  if (!watcher) return;

  this.directoryWatchers.delete(watcherKey);
  await watcher.close();
}
```

4. 新增 `notifyWindowsSkill` 方法：
```typescript
/**
 * 向所有窗口广播 skill 目录变化事件。
 * @param type - 事件类型
 * @param filePath - 文件路径
 * @param content - 文件内容（仅 change/add 事件携带）
 */
private notifyWindowsSkill(type: 'change' | 'add' | 'unlink', filePath: string, content?: string): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('skill:changed', { type, filePath, content });
  });
}
```

5. 修改 `unwatchAll` 方法，同时关闭目录 watcher：
```typescript
async unwatchAll(): Promise<void> {
  const fileWatchers = Array.from(this.watchers.values());
  const dirWatchers = Array.from(this.directoryWatchers.values());
  this.watchers.clear();
  this.directoryWatchers.clear();
  await Promise.all([...fileWatchers, ...dirWatchers].map((watcher) => watcher.close()));
}
```

- [ ] **Step 3: 新增 IPC handler**

在 `electron/main/modules/file/ipc.mts` 中追加：

```typescript
ipcMain.handle('fs:watchDirectory', async (_event, dirPath: string, globPattern?: string) => {
  await fileWatchService.watchDirectory(dirPath, globPattern);
});

ipcMain.handle('fs:unwatchDirectory', async (_event, dirPath: string, globPattern?: string) => {
  await fileWatchService.unwatchDirectory(dirPath, globPattern);
});
```

- [ ] **Step 4: 新增 Preload 方法**

在 `electron/preload/index.mts` 中追加（在 `onFileChanged` 附近）：

```typescript
watchDirectory: (dirPath: string, globPattern?: string) => ipcRenderer.invoke('fs:watchDirectory', dirPath, globPattern),

unwatchDirectory: (dirPath: string, globPattern?: string) => ipcRenderer.invoke('fs:unwatchDirectory', dirPath, globPattern),

onSkillChanged: (callback) => {
  const handler = (_event: Electron.IpcRendererEvent, data: { type: string; filePath: string; content?: string }) => {
    callback(data);
  };
  ipcRenderer.on('skill:changed', handler);
  return () => {
    ipcRenderer.removeListener('skill:changed', handler);
  };
},
```

- [ ] **Step 5: 更新类型定义**

在 `types/electron-api.d.ts` 的 `ElectronAPI` 接口中追加：

```typescript
watchDirectory: (dirPath: string, globPattern?: string) => Promise<void>;
unwatchDirectory: (dirPath: string, globPattern?: string) => Promise<void>;
onSkillChanged: (callback: (data: { type: string; filePath: string; content?: string }) => void) => () => void;
```

- [ ] **Step 6: 运行全量测试确认无回归**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add electron/main/modules/file/service.mts electron/main/modules/file/ipc.mts electron/preload/index.mts types/electron-api.d.ts test/electron/fileWatchService.test.ts
git commit -m "feat(skill): extend FileWatchService with directory watching for skill files"
```

---

### Task 10: 设置页 Skill 管理 UI

**Files:**
- Create: `src/views/settings/skill/index.vue`
- Modify: `src/views/settings/` 路由配置（添加 skill 标签页）

> 此 Task 为 UI 实现，不涉及 TDD（组件测试在后续迭代中补充）。实现要点：
> - 搜索路径管理：添加/删除自定义目录
> - Skill 列表：展示名称、描述、来源、路径
> - 解析失败标记：警告图标 + 错误信息
> - 启用/禁用开关
> - 刷新按钮
> - 点击展开查看 SKILL.md 正文
> - 路径可点击打开文件位置

- [ ] **Step 1: 创建设置页 Skill 组件**

按照设计文档中的 UI mockup 实现 `src/views/settings/skill/index.vue`，使用 Ant Design Vue 组件。

- [ ] **Step 2: 注册路由**

在设置页路由中添加 skill 标签页入口。

- [ ] **Step 3: 手动验证**

启动应用 → 设置页 → Skills 标签页 → 验证列表展示、启用/禁用、路径管理功能。

- [ ] **Step 4: 提交**

```bash
git add src/views/settings/skill/
git commit -m "feat(skill): add skill management UI in settings page"
```

---

### Task 11: 聊天侧边栏 Skill 提示

**Files:**
- Create: `src/components/BChatSidebar/components/SkillIndicator.vue`
- Modify: `src/components/BChatSidebar/` 聊天区域模板

> 此 Task 为 UI 实现。实现要点：
> - 仅在 LLM 调用 skill 工具后显示
> - 同一 skill 去重
> - 多个 skill 并列标签形式
> - 鼠标悬停 tooltip 展示 description
> - 关闭后不再显示（当前对话）

- [ ] **Step 1: 创建 SkillIndicator 组件**

实现轻量提示组件，监听聊天流中的 skill 工具调用结果。

- [ ] **Step 2: 集成到聊天侧边栏**

在聊天输入区域上方插入 SkillIndicator。

- [ ] **Step 3: 手动验证**

在聊天中触发 skill 工具调用 → 验证提示显示、去重、tooltip。

- [ ] **Step 4: 提交**

```bash
git add src/components/BChatSidebar/components/SkillIndicator.vue
git commit -m "feat(skill): add skill indicator in chat sidebar"
```

---

### Task 12: 端到端集成验证

**Files:**
- 无新增文件

- [ ] **Step 1: 创建测试用 SKILL.md**

在工作区 `.agents/skills/test-skill/SKILL.md` 创建测试 skill：

```markdown
---
name: test-skill
description: A test skill for integration verification.
---

# Test Skill

This is a test skill for verifying the skill system integration.
When loaded, respond with "Test skill loaded successfully".
```

- [ ] **Step 2: 启动应用验证完整流程**

1. 启动应用 → 设置页 → Skills 标签页 → 确认 `test-skill` 已发现
2. 聊天中发送消息触发 LLM → 确认 LLM 可看到 skill 工具
3. LLM 调用 skill 工具 → 确认返回正确内容
4. 修改 SKILL.md → 确认目录监听触发增量更新
5. 禁用 skill → 确认工具 description 不再列出该 skill

- [ ] **Step 3: 运行全量测试**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git commit -m "chore(skill): end-to-end integration verification complete"
```
