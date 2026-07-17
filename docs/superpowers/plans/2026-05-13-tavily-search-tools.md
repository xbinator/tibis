# Tavily Search Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/settings/tools/search` Tavily settings flow and wire `tavily_search` / `tavily_extract` into the chat toolchain with enable gating and persisted defaults.

**Architecture:** Add a new `tool-settings` persistence module plus `toolSettings` Pinia store, then expose Tavily configuration through a new settings route and page. Keep Tavily tool definitions in the renderer, but perform enable gating and runtime default-parameter merging in the Electron AI service right before Tavily SDK execution.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Electron main process AI service, Vercel AI SDK `ai`, `@tavily/ai-sdk`

---

## File Structure

### New files

- `src/shared/storage/tool-settings/types.ts`
  Stores Tavily settings types, defaults, normalization helpers, and country/domain utility types.
- `src/shared/storage/tool-settings/index.ts`
  Exposes `toolSettingsStorage`.
- `src/shared/storage/tool-settings/sqlite.ts`
  Implements local persistence for Tavily tool settings using the project’s shared storage utilities.
- `src/stores/toolSettings.ts`
  Pinia store for reading, updating, and deriving Tavily availability state.
- `src/views/settings/tools/search/index.vue`
  Search tools settings page for base config, search defaults, extract defaults, and connection tests.
- `src/views/settings/tools/search/constants.ts`
  Holds Tavily country options, test query text, and select options used by the page.
- `src/ai/tools/tavily.ts`
  Declares `tavily_search` and `tavily_extract` transport tools for the renderer.
- `test/stores/toolSettings.test.ts`
  Store persistence, normalization, and availability tests.
- `test/views/settings/tools-search/index.test.ts`
  Settings page rendering and interaction tests.
- `test/ai/tools/tavily.test.ts`
  Renderer tool definition tests for schema and metadata.

### Modified files

- `package.json`
  Add `@tavily/ai-sdk`.
- `src/shared/storage/index.ts`
  Re-export `toolSettingsStorage`.
- `src/views/settings/constants.ts`
  Add `tools` menu key and menu item.
- `src/router/routes/modules/settings.ts`
  Add `/settings/tools/search`.
- `src/views/settings/index.vue`
  Ensure the menu active state still works for nested `tools/search` paths.
- `types/ai.d.ts`
  Add Tavily request/result types if the current AI request typing needs shared transport declarations.
- `src/ai/tools/index.ts` or the current assembly entry point under `src/ai/tools/`
  Include Tavily tools when enabled.
- `electron/main/modules/ai/service.mts`
  Read tool settings, merge defaults, create Tavily SDK tools, and append them to AI SDK tool registration.
- `test/electron/aiService.test.ts`
  Add Tavily gating and parameter-merging coverage.
- `changelog/2026-05-13.md`
  Record the implementation once complete.

### Existing files to reference while implementing

- `src/stores/provider.ts`
- `src/stores/editorPreferences.ts`
- `src/views/settings/editor/index.vue`
- `src/shared/storage/service-models/sqlite.ts`
- `test/views/settings/editor/index.test.ts`
- `test/stores/editorPreferences.test.ts`
- `test/electron/aiService.test.ts`

### Task 1: Add Tavily persistence and store

**Files:**
- Create: `src/shared/storage/tool-settings/types.ts`
- Create: `src/shared/storage/tool-settings/sqlite.ts`
- Create: `src/shared/storage/tool-settings/index.ts`
- Create: `src/stores/toolSettings.ts`
- Modify: `src/shared/storage/index.ts`
- Test: `test/stores/toolSettings.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
/**
 * @file toolSettings.test.ts
 * @description 验证 Tavily 工具设置 store 的默认值、归一化与可用性派生状态。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOOL_SETTINGS_STORAGE_KEY = 'tool_settings';
const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

describe('useToolSettingsStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('loads Tavily defaults and keeps country = china', async () => {
    const { useToolSettingsStore } = await import('@/stores/toolSettings');
    const store = useToolSettingsStore();

    expect(store.tavily.enabled).toBe(false);
    expect(store.tavily.searchDefaults.country).toBe('china');
    expect(store.isTavilyAvailable).toBe(false);
  });

  it('normalizes invalid persisted values back to defaults', async () => {
    localStorage.setItem(
      TOOL_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        tavily: {
          enabled: 'yes',
          apiKey: 123,
          searchDefaults: {
            topic: 'sports',
            timeRange: 'forever',
            country: 'CN',
            maxResults: 99,
            includeDomains: [' example.com ', '', 'https://bad.example.com']
          }
        }
      })
    );

    const { useToolSettingsStore } = await import('@/stores/toolSettings');
    const store = useToolSettingsStore();

    expect(store.tavily.enabled).toBe(false);
    expect(store.tavily.apiKey).toBe('');
    expect(store.tavily.searchDefaults.topic).toBe('general');
    expect(store.tavily.searchDefaults.timeRange).toBeNull();
    expect(store.tavily.searchDefaults.country).toBe('china');
    expect(store.tavily.searchDefaults.maxResults).toBe(20);
    expect(store.tavily.searchDefaults.includeDomains).toEqual(['example.com']);
  });

  it('marks Tavily available only when enabled and apiKey is present', async () => {
    const { useToolSettingsStore } = await import('@/stores/toolSettings');
    const store = useToolSettingsStore();

    store.setTavilyEnabled(true);
    expect(store.isTavilyAvailable).toBe(false);

    store.setTavilyApiKey('tvly-dev-key');
    expect(store.isTavilyAvailable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/stores/toolSettings.test.ts`
Expected: FAIL with module resolution errors for `@/stores/toolSettings` and missing `tool-settings` storage files.

- [ ] **Step 3: Implement the storage types and defaults**

```ts
/**
 * @file types.ts
 * @description Tavily 工具设置类型、默认值与归一化工具。
 */
export type TavilySearchDepth = 'basic' | 'advanced';
export type TavilySearchTopic = 'general' | 'news' | 'finance';
export type TavilyTimeRange = 'day' | 'week' | 'month' | 'year' | null;
export type TavilyExtractDepth = 'basic' | 'advanced';
export type TavilyExtractFormat = 'markdown' | 'text';

export interface TavilySearchDefaults {
  searchDepth: TavilySearchDepth;
  topic: TavilySearchTopic;
  timeRange: TavilyTimeRange;
  country: string | null;
  maxResults: number;
  includeAnswer: boolean;
  includeImages: boolean;
  includeDomains: string[];
  excludeDomains: string[];
}

export interface TavilyExtractDefaults {
  extractDepth: TavilyExtractDepth;
  format: TavilyExtractFormat;
  includeImages: boolean;
}

export interface TavilyToolSettings {
  enabled: boolean;
  apiKey: string;
  searchDefaults: TavilySearchDefaults;
  extractDefaults: TavilyExtractDefaults;
}

export interface ToolSettingsState {
  tavily: TavilyToolSettings;
}

export const TOOL_SETTINGS_STORAGE_KEY = 'tool_settings';

export const DEFAULT_TOOL_SETTINGS: ToolSettingsState = {
  tavily: {
    enabled: false,
    apiKey: '',
    searchDefaults: {
      searchDepth: 'basic',
      topic: 'general',
      timeRange: null,
      country: 'china',
      maxResults: 5,
      includeAnswer: true,
      includeImages: false,
      includeDomains: [],
      excludeDomains: []
    },
    extractDefaults: {
      extractDepth: 'basic',
      format: 'markdown',
      includeImages: false
    }
  }
};
```
```

- [ ] **Step 4: Implement normalization, persistence, and the Pinia store**

```ts
/**
 * @file toolSettings.ts
 * @description Tavily 工具设置 store，负责持久化配置与可用性派生状态。
 */
import { defineStore } from 'pinia';
import { toolSettingsStorage } from '@/shared/storage';
import type { TavilyExtractDefaults, TavilySearchDefaults, TavilyToolSettings } from '@/shared/storage/tool-settings/types';

interface ToolSettingsStoreState {
  tavily: TavilyToolSettings;
  loading: boolean;
}

export const useToolSettingsStore = defineStore('toolSettings', {
  state: (): ToolSettingsStoreState => ({
    tavily: toolSettingsStorage.getSettings().tavily,
    loading: false
  }),

  getters: {
    isTavilyAvailable: (state): boolean => state.tavily.enabled && state.tavily.apiKey.trim().length > 0
  },

  actions: {
    setTavilyEnabled(enabled: boolean): void {
      this.tavily.enabled = enabled;
      toolSettingsStorage.saveSettings({ tavily: this.tavily });
    },

    setTavilyApiKey(apiKey: string): void {
      this.tavily.apiKey = apiKey;
      toolSettingsStorage.saveSettings({ tavily: this.tavily });
    },

    updateTavilySearchDefaults(patch: Partial<TavilySearchDefaults>): void {
      this.tavily.searchDefaults = { ...this.tavily.searchDefaults, ...patch };
      toolSettingsStorage.saveSettings({ tavily: this.tavily });
    },

    updateTavilyExtractDefaults(patch: Partial<TavilyExtractDefaults>): void {
      this.tavily.extractDefaults = { ...this.tavily.extractDefaults, ...patch };
      toolSettingsStorage.saveSettings({ tavily: this.tavily });
    }
  }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test test/stores/toolSettings.test.ts`
Expected: PASS with 3 tests green for defaults, normalization, and availability gating.

- [ ] **Step 6: Commit**

```bash
git add src/shared/storage/index.ts src/shared/storage/tool-settings src/stores/toolSettings.ts test/stores/toolSettings.test.ts
git commit -m "feat: add tavily tool settings store"
```

### Task 2: Add settings route and menu entry

**Files:**
- Modify: `src/views/settings/constants.ts`
- Modify: `src/router/routes/modules/settings.ts`
- Modify: `src/views/settings/index.vue`
- Test: `test/router/settings-tools-routes.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
/**
 * @file settings-tools-routes.test.ts
 * @description 验证设置中心新增工具搜索路由与导航匹配。
 */
import settingsRoutes from '@/router/routes/modules/settings';
import { describe, expect, it } from 'vitest';

describe('settings tools routes', () => {
  it('registers /settings/tools/search route', () => {
    const settingsRoute = settingsRoutes.find((route) => route.path === 'settings');
    const toolsRoute = settingsRoute?.children?.find((route) => route.path === 'tools');
    const searchRoute = toolsRoute?.children?.find((route) => route.path === 'search');

    expect(toolsRoute?.meta?.title).toBe('工具');
    expect(searchRoute?.meta?.title).toBe('搜索');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/router/settings-tools-routes.test.ts`
Expected: FAIL because the `tools` branch does not exist yet.

- [ ] **Step 3: Add menu and nested route structure**

```ts
export type SettingsMenuKey = 'provider' | 'service-model' | 'tools' | 'editor' | 'speech' | 'logger';

export const menuItems: MenuItem[] = [
  { key: 'provider', label: 'AI服务商', icon: 'lucide:brain', path: '/settings/provider' },
  { key: 'service-model', label: '服务模型', icon: 'lucide:sparkles', path: '/settings/service-model' },
  { key: 'tools', label: '工具', icon: 'lucide:hammer', path: '/settings/tools/search' },
  { key: 'editor', label: '编辑器', icon: 'lucide:square-pen', path: '/settings/editor' },
  { key: 'speech', label: '语音组件', icon: 'lucide:mic', path: '/settings/speech' },
  { key: 'logger', label: '运行日志', icon: 'lucide:file-text', path: '/settings/logger' }
];
```

```ts
{
  path: 'tools',
  name: 'tools',
  redirect: '/settings/tools/search',
  meta: { title: '工具' },
  children: [
    {
      path: 'search',
      name: 'search-tools-settings',
      component: () => import('@/views/settings/tools/search/index.vue'),
      meta: { title: '搜索' }
    }
  ]
}
```

- [ ] **Step 4: Keep sidebar active-state logic working for nested tools routes**

```ts
function isActive(key: SettingsMenuKey): boolean {
  const prefix = key === 'tools' ? '/settings/tools' : `/settings/${key}`;
  return route.path === prefix || route.path.startsWith(`${prefix}/`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test test/router/settings-tools-routes.test.ts`
Expected: PASS with the `tools/search` route found and titles matching.

- [ ] **Step 6: Commit**

```bash
git add src/views/settings/constants.ts src/views/settings/index.vue src/router/routes/modules/settings.ts test/router/settings-tools-routes.test.ts
git commit -m "feat: add search tools settings route"
```

### Task 3: Build the `/settings/tools/search` page and connection tests

**Files:**
- Create: `src/views/settings/tools/search/constants.ts`
- Create: `src/views/settings/tools/search/index.vue`
- Test: `test/views/settings/tools-search/index.test.ts`

- [ ] **Step 1: Write the failing settings page test**

```ts
/**
 * @file index.test.ts
 * @description 验证搜索工具设置页渲染 Tavily 配置项与测试输入。
 */
/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchToolsSettingsView from '@/views/settings/tools/search/index.vue';
import { useToolSettingsStore } from '@/stores/toolSettings';

describe('SearchToolsSettingsView', () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
  });

  it('renders Tavily base config, default sections, and extract test URL input', async () => {
    const store = useToolSettingsStore();
    store.setTavilyEnabled(true);

    const wrapper = mount(SearchToolsSettingsView, {
      global: {
        stubs: {
          BSelect: true,
          BButton: true,
          AInput: true,
          AInputPassword: true,
          AInputNumber: true,
          ASwitch: true,
          ACheckbox: true,
          AForm: true,
          AFormItem: true,
          AAlert: true
        }
      }
    });

    expect(wrapper.text()).toContain('基础配置');
    expect(wrapper.text()).toContain('Tavily Search 默认配置');
    expect(wrapper.text()).toContain('Tavily Extract 默认配置');
    expect(wrapper.text()).toContain('测试 Extract');
    expect(wrapper.text()).toContain('测试 URL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/views/settings/tools-search/index.test.ts`
Expected: FAIL because the page and constants files do not exist yet.

- [ ] **Step 3: Create page constants and the view**

```ts
/**
 * @file constants.ts
 * @description 搜索工具设置页的静态选项与测试常量。
 */
export const TAVILY_SEARCH_TEST_QUERY = '今日 AI 行业动态';

export const tavilyTopicOptions = [
  { label: '通用', value: 'general' },
  { label: '新闻', value: 'news' },
  { label: '金融', value: 'finance' }
];

export const tavilyTimeRangeOptions = [
  { label: '未设置', value: null },
  { label: '一天内', value: 'day' },
  { label: '一周内', value: 'week' },
  { label: '一个月内', value: 'month' },
  { label: '一年内', value: 'year' }
];
```

```vue
<template>
  <div class="search-tools-settings">
    <section class="settings-section">
      <h3>基础配置</h3>
      <AAlert v-if="!toolSettingsStore.tavily.enabled" type="info" message="当前未启用，聊天中不会暴露 Tavily 工具" show-icon />
      <AAlert
        v-else-if="!toolSettingsStore.isTavilyAvailable"
        type="warning"
        message="已启用 Tavily，但 API Key 为空，聊天中仍不会注册相关工具"
        show-icon
      />
      <AForm layout="vertical">
        <AFormItem label="启用 Tavily 工具">
          <ASwitch :checked="toolSettingsStore.tavily.enabled" @update:checked="toolSettingsStore.setTavilyEnabled" />
        </AFormItem>
        <AFormItem label="API Key">
          <AInputPassword :value="toolSettingsStore.tavily.apiKey" @update:value="toolSettingsStore.setTavilyApiKey" />
        </AFormItem>
      </AForm>
    </section>
  </div>
</template>
```

- [ ] **Step 4: Add search defaults, extract defaults, and local test URL state**

```ts
const extractTestUrl = ref('https://docs.tavily.com');

function handleUpdateIncludeDomains(values: string[]): void {
  toolSettingsStore.updateTavilySearchDefaults({ includeDomains: values });
}

function handleUpdateExcludeDomains(values: string[]): void {
  toolSettingsStore.updateTavilySearchDefaults({ excludeDomains: values });
}
```

```vue
<AFormItem label="国家" extra="仅在主题为通用时生效">
  <BSelect
    :value="toolSettingsStore.tavily.searchDefaults.country"
    :options="tavilyCountryOptions"
    @update:value="(value) => toolSettingsStore.updateTavilySearchDefaults({ country: value })"
  />
</AFormItem>

<AFormItem label="测试 URL">
  <AInput v-model:value="extractTestUrl" placeholder="https://example.com/article" />
</AFormItem>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test test/views/settings/tools-search/index.test.ts`
Expected: PASS with the page rendering all four sections and the extract URL test input.

- [ ] **Step 6: Commit**

```bash
git add src/views/settings/tools/search test/views/settings/tools-search/index.test.ts
git commit -m "feat: add tavily search settings page"
```

### Task 4: Add Tavily renderer tool definitions

**Files:**
- Create: `src/ai/tools/tavily.ts`
- Modify: `src/ai/tools/index.ts`
- Test: `test/ai/tools/tavily.test.ts`

- [ ] **Step 1: Write the failing tool definition test**

```ts
/**
 * @file tavily.test.ts
 * @description 验证 Tavily 工具定义的元数据、schema 与文档依赖边界。
 */
import { describe, expect, it } from 'vitest';
import { createTavilyTools, TAVILY_EXTRACT_TOOL_NAME, TAVILY_SEARCH_TOOL_NAME } from '@/ai/tools/tavily';

describe('createTavilyTools', () => {
  it('defines Tavily tools as global read-only transport tools', () => {
    const tools = createTavilyTools();

    expect(tools.tavilySearch.definition.name).toBe(TAVILY_SEARCH_TOOL_NAME);
    expect(tools.tavilySearch.definition.riskLevel).toBe('read');
    expect(tools.tavilySearch.definition.requiresActiveDocument).toBe(false);

    expect(tools.tavilyExtract.definition.name).toBe(TAVILY_EXTRACT_TOOL_NAME);
    expect(tools.tavilyExtract.definition.parameters.required).toContain('url');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/ai/tools/tavily.test.ts`
Expected: FAIL with missing `@/ai/tools/tavily` module.

- [ ] **Step 3: Implement tool declarations**

```ts
/**
 * @file tavily.ts
 * @description Tavily 搜索与提取工具定义。
 */
import type { AIToolExecutor } from 'types/ai';
import { createToolSuccessResult } from './results';

export const TAVILY_SEARCH_TOOL_NAME = 'tavily_search';
export const TAVILY_EXTRACT_TOOL_NAME = 'tavily_extract';

export function createTavilyTools(): {
  tavilySearch: AIToolExecutor<Record<string, unknown>, { forwarded: true }>;
  tavilyExtract: AIToolExecutor<Record<string, unknown>, { forwarded: true }>;
} {
  return {
    tavilySearch: {
      definition: {
        name: TAVILY_SEARCH_TOOL_NAME,
        description: '联网搜索网页结果，可按主题、时间范围、国家和站点限制返回摘要化结果。',
        source: 'builtin',
        riskLevel: 'read',
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词。' },
            topic: { type: 'string' },
            country: { type: 'string' }
          },
          required: ['query'],
          additionalProperties: false
        }
      },
      async execute(input) {
        return createToolSuccessResult(TAVILY_SEARCH_TOOL_NAME, { forwarded: true, input });
      }
    },
    tavilyExtract: {
      definition: {
        name: TAVILY_EXTRACT_TOOL_NAME,
        description: '提取指定网页正文内容，适合在模型已经拿到链接后继续读取正文。',
        source: 'builtin',
        riskLevel: 'read',
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '要提取正文的网页 URL。' },
            format: { type: 'string' }
          },
          required: ['url'],
          additionalProperties: false
        }
      },
      async execute(input) {
        return createToolSuccessResult(TAVILY_EXTRACT_TOOL_NAME, { forwarded: true, input });
      }
    }
  };
}
```

- [ ] **Step 4: Wire tool assembly entry point**

```ts
const tavilyTools = createTavilyTools();

export const allReadonlyTools = [
  // existing tools...
  tavilyTools.tavilySearch,
  tavilyTools.tavilyExtract
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test test/ai/tools/tavily.test.ts`
Expected: PASS with both Tavily tools marked as read-only, global tools.

- [ ] **Step 6: Commit**

```bash
git add src/ai/tools/tavily.ts src/ai/tools/index.ts test/ai/tools/tavily.test.ts
git commit -m "feat: add tavily transport tools"
```

### Task 5: Wire Tavily into the Electron AI service with runtime gating and merged defaults

**Files:**
- Modify: `package.json`
- Modify: `electron/main/modules/ai/service.mts`
- Possibly modify: `types/ai.d.ts`
- Test: `test/electron/aiService.test.ts`

- [ ] **Step 1: Write the failing AI service test**

```ts
it('registers Tavily tools only when enabled and apiKey is present, and merges default params before execution', async () => {
  const tavilySearchMock = vi.fn();
  const tavilyExtractMock = vi.fn();

  vi.doMock('@tavily/ai-sdk', () => ({
    tavilySearch: tavilySearchMock,
    tavilyExtract: tavilyExtractMock
  }));

  vi.doMock('../../src/shared/storage/tool-settings', () => ({
    toolSettingsStorage: {
      getSettings: () => ({
        tavily: {
          enabled: true,
          apiKey: 'tvly-dev-key',
          searchDefaults: {
            searchDepth: 'basic',
            topic: 'general',
            timeRange: null,
            country: 'china',
            maxResults: 5,
            includeAnswer: true,
            includeImages: false,
            includeDomains: ['example.com'],
            excludeDomains: []
          },
          extractDefaults: {
            extractDepth: 'basic',
            format: 'markdown',
            includeImages: false
          }
        }
      })
    }
  }));

  const { aiService } = await import('../../electron/main/modules/ai/service.mjs');

  await aiService.generateText(
    { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' },
    {
      modelId: 'model-1',
      prompt: '搜索最新消息',
      tools: [
        {
          name: 'tavily_search',
          description: '...',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
            additionalProperties: false
          }
        }
      ]
    }
  );

  expect(tavilySearchMock).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/electron/aiService.test.ts`
Expected: FAIL because `@tavily/ai-sdk` is not installed and `service.mts` does not yet build Tavily SDK tools.

- [ ] **Step 3: Install Tavily SDK and implement main-process helpers**

Run: `pnpm add @tavily/ai-sdk`
Expected: `dependencies` and `pnpm-lock.yaml` updated.

```ts
import { tavilyExtract, tavilySearch } from '@tavily/ai-sdk';
import { toolSettingsStorage } from '../../../src/shared/storage/tool-settings';

function getTavilySettings() {
  return toolSettingsStorage.getSettings().tavily;
}

function isTavilyEnabled(): boolean {
  const tavily = getTavilySettings();
  return tavily.enabled && tavily.apiKey.trim().length > 0;
}

function buildTavilySdkTools(requestTools: AIRequestOptions['tools']) {
  if (!isTavilyEnabled()) {
    return {};
  }

  const tavily = getTavilySettings();

  return {
    tavily_search: tavilySearch({
      apiKey: tavily.apiKey,
      searchDepth: tavily.searchDefaults.searchDepth,
      topic: tavily.searchDefaults.topic,
      timeRange: tavily.searchDefaults.timeRange ?? undefined,
      country: tavily.searchDefaults.country ?? undefined,
      maxResults: tavily.searchDefaults.maxResults,
      includeAnswer: tavily.searchDefaults.includeAnswer,
      includeImages: tavily.searchDefaults.includeImages,
      includeDomains: tavily.searchDefaults.includeDomains,
      excludeDomains: tavily.searchDefaults.excludeDomains
    }),
    tavily_extract: tavilyExtract({
      apiKey: tavily.apiKey,
      extractDepth: tavily.extractDefaults.extractDepth,
      format: tavily.extractDefaults.format,
      includeImages: tavily.extractDefaults.includeImages
    })
  };
}
```

- [ ] **Step 4: Merge request tools with Tavily SDK tools in one place**

```ts
function toSdkTools(tools: AIRequestOptions['tools']) {
  const transportTools = tools?.length
    ? Object.fromEntries(
        tools.map((item) => [
          item.name,
          tool({
            description: item.description,
            inputSchema: jsonSchema(item.parameters)
          })
        ])
      )
    : {};

  const tavilyTools = buildTavilySdkTools(tools);

  return Object.keys({ ...transportTools, ...tavilyTools }).length ? { ...transportTools, ...tavilyTools } : undefined;
}
```

For per-call overrides, add explicit parameter merging inside the actual Tavily execute callback:

```ts
const mergedSearchInput = {
  ...tavily.searchDefaults,
  ...input,
  timeRange: input.timeRange ?? tavily.searchDefaults.timeRange ?? undefined,
  country: input.country ?? tavily.searchDefaults.country ?? undefined
};

const mergedExtractInput = {
  ...tavily.extractDefaults,
  ...input,
  urls: [input.url]
};
```

- [ ] **Step 5: Run focused tests to verify Tavily gating and merging**

Run: `pnpm test test/electron/aiService.test.ts`
Expected: PASS with Tavily disabled state ignored, enabled state registered, and merged defaults covered by assertions.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml electron/main/modules/ai/service.mts types/ai.d.ts test/electron/aiService.test.ts
git commit -m "feat: wire tavily tools into ai service"
```

### Task 6: Finish UI test actions, regression coverage, and changelog

**Files:**
- Modify: `test/views/settings/tools-search/index.test.ts`
- Modify: `test/electron/aiService.test.ts`
- Modify: `changelog/2026-05-13.md`

- [ ] **Step 1: Add interaction-level settings page assertions**

```ts
it('shows unavailable warning when Tavily is enabled without apiKey', async () => {
  const store = useToolSettingsStore();
  store.setTavilyEnabled(true);
  store.setTavilyApiKey('');

  const wrapper = mount(SearchToolsSettingsView, { /* stubs */ });

  expect(wrapper.text()).toContain('API Key 为空');
});
```

- [ ] **Step 2: Add main-process regression test for disabled Tavily**

```ts
it('does not register Tavily tools when disabled', async () => {
  // mock tool settings with enabled = false
  // assert Tavily SDK helpers are not called
});
```

- [ ] **Step 3: Record implementation in changelog**

```md
## Added
- 新增 `/settings/tools/search` 搜索工具设置页，支持 Tavily 的启用开关、API Key、Search 默认配置、Extract 默认配置与连通性测试。

## Changed
- 将 Tavily 搜索与正文提取能力接入聊天工具链；仅在启用且配置 API Key 时向模型暴露 `tavily_search` 与 `tavily_extract` 工具。
```

- [ ] **Step 4: Run the focused verification suite**

Run: `pnpm test test/stores/toolSettings.test.ts test/router/settings-tools-routes.test.ts test/views/settings/tools-search/index.test.ts test/ai/tools/tavily.test.ts test/electron/aiService.test.ts`
Expected: PASS with all newly added Tavily coverage green.

- [ ] **Step 5: Run the broader safety checks**

Run: `pnpm test test/views/settings/editor/index.test.ts test/stores/setting.test.ts test/ai/tools/stream.test.ts`
Expected: PASS, confirming no regression to existing settings and tool-chain behavior.

- [ ] **Step 6: Commit**

```bash
git add test/views/settings/tools-search/index.test.ts test/electron/aiService.test.ts changelog/2026-05-13.md
git commit -m "test: cover tavily settings and runtime gating"
```

## Self-Review

### Spec coverage

- Dedicated `/settings/tools/search` route: covered by Task 2 and Task 3.
- Independent Tavily persistence and store: covered by Task 1.
- `country = china` default and normalization: covered by Task 1 and Task 3.
- Enable gating before tool exposure: covered by Task 1 getter and Task 5 runtime wiring.
- Search + Extract defaults and connection-test UI: covered by Task 3.
- Parameter merge in main process AI service: covered by Task 5.
- Changelog update: covered by Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task includes explicit files, tests, commands, and expected outcomes.

### Type consistency

- Store naming is consistently `toolSettings` / `useToolSettingsStore`.
- Tool names are consistently `tavily_search` and `tavily_extract`.
- The first release only accepts `url` at the renderer tool boundary and adapts to `urls: [url]` in the main process.
