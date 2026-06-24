# BCommandPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified `BCommandPanel` that replaces the global recent-record dialog and chat model dialog while preserving recent-only and model-only entry behavior.

**Architecture:** Create a single Vue panel component with a typed source interface. Route the current input to `recentSource`, `jumpSource`, or `modelSource` through a pure query parser, so deleting text naturally changes the active source without sticky state. Keep business behavior inside sources and keep the panel responsible for modal UI, keyboard navigation, grouping, icon rendering, and close/focus behavior.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Pinia stores, Vitest + Vue Test Utils, `lodash-es` debounce, existing `BModal`, `BScrollbar`, `BRecentIcon`, `BModelIcon`, and native path status APIs.

**Repository Constraint:** Do not create git commits while executing this plan. The user will commit all finished work.

---

## File Structure

- Create `src/components/BCommandPanel/types.ts`
  Defines `CommandPanelScope`, source ids, groups, items, icon context, source interface, parser result, and exposed component API.

- Create `src/components/BCommandPanel/utils/query.ts`
  Pure input router for `recent` and `model` scopes. This file must not import Vue or stores.

- Create `src/components/BCommandPanel/sources/jump.ts`
  Builds jump command results for `>` input. First command is `> model`.

- Create `src/components/BCommandPanel/sources/recent.ts`
  Converts recent records, URL candidates, and absolute path candidates into command panel groups. Reuses existing recent open/remove behavior.

- Create `src/components/BCommandPanel/sources/model.ts`
  Converts `providerStore.availableModels` into provider groups and marks the active chat model.

- Create `src/components/BCommandPanel/index.vue`
  The only modal UI. Owns input, query routing, source loading/searching, keyboard highlight, selection, removal, empty states, and focus handling.

- Modify `src/layouts/default/index.vue`
  Mount the single global `BCommandPanel` instance and open recent scope through `useCommandPanelStore`.

- Modify `src/views/welcome/index.vue`
  Delegate the welcome-page “更多” entry to `commandPanelStore.openRecent()`.

- Modify `src/components/BChat/index.vue`
  Replace the global `BModelSelect` modal with `commandPanelStore.openModel()` and focus the prompt editor after close/select.

- Update `test/components/BRecent/recent.component.test.ts`
  Either migrate relevant behavioral coverage to `BCommandPanel` tests or leave only `BRecentIcon`-specific assertions if `BRecent/index.vue` is removed.

- Create `test/components/BCommandPanel/query.test.ts`
  Covers query routing edge cases.

- Create `test/components/BCommandPanel/sources.test.ts`
  Covers source item creation, active model marking, URL/path candidates, remove behavior, and jump commands.

- Create `test/components/BCommandPanel/index.test.ts`
  Covers modal UI behavior, keyboard navigation, jump routing, model-only scope, selection, deletion, empty states, and focus callback.

- Modify `test/layouts/default/index-chat-sider-loading.test.ts`
  Expect the default layout to import and mount the global `BCommandPanel` singleton and open recent scope through the store.

- Modify `test/views/welcome/recent-loading.test.ts`
  Expect the welcome page to delegate recent search to the global command panel store.

- Add or update `changelog/2026-06-24.md`
  Record the unified command panel change under `Added` or `Changed`.

## Task 1: Query Parser

**Files:**
- Create: `src/components/BCommandPanel/types.ts`
- Create: `src/components/BCommandPanel/utils/query.ts`
- Create: `test/components/BCommandPanel/query.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `test/components/BCommandPanel/query.test.ts`:

```ts
/**
 * @file query.test.ts
 * @description 验证 BCommandPanel 输入内容到 source 的路由解析。
 */
import { describe, expect, it } from 'vitest';
import { parseCommandPanelQuery } from '@/components/BCommandPanel/utils/query';

describe('parseCommandPanelQuery', (): void => {
  it('routes model scope to model source for every input', (): void => {
    expect(parseCommandPanelQuery('model', '')).toEqual({ sourceId: 'model', keyword: '' });
    expect(parseCommandPanelQuery('model', 'qwen')).toEqual({ sourceId: 'model', keyword: 'qwen' });
    expect(parseCommandPanelQuery('model', '>')).toEqual({ sourceId: 'model', keyword: '>' });
  });

  it('routes normal recent input to recent source', (): void => {
    expect(parseCommandPanelQuery('recent', '')).toEqual({ sourceId: 'recent', keyword: '' });
    expect(parseCommandPanelQuery('recent', 'alpha')).toEqual({ sourceId: 'recent', keyword: 'alpha' });
  });

  it('routes incomplete jump input to jump source', (): void => {
    expect(parseCommandPanelQuery('recent', '>')).toEqual({ sourceId: 'jump', keyword: '' });
    expect(parseCommandPanelQuery('recent', '> mo')).toEqual({ sourceId: 'jump', keyword: 'mo' });
    expect(parseCommandPanelQuery('recent', '> models')).toEqual({ sourceId: 'jump', keyword: 'models' });
    expect(parseCommandPanelQuery('recent', '> modelx')).toEqual({ sourceId: 'jump', keyword: 'modelx' });
  });

  it('routes model jump command to model source', (): void => {
    expect(parseCommandPanelQuery('recent', '> model')).toEqual({ sourceId: 'model', keyword: '' });
    expect(parseCommandPanelQuery('recent', '> model ')).toEqual({ sourceId: 'model', keyword: '' });
    expect(parseCommandPanelQuery('recent', '> model qwen')).toEqual({ sourceId: 'model', keyword: 'qwen' });
    expect(parseCommandPanelQuery('recent', '> model qwen extra')).toEqual({ sourceId: 'model', keyword: 'qwen extra' });
  });
});
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
pnpm test test/components/BCommandPanel/query.test.ts
```

Expected: FAIL because `src/components/BCommandPanel/utils/query.ts` does not exist.

- [ ] **Step 3: Add shared command panel types**

Create `src/components/BCommandPanel/types.ts`:

```ts
/**
 * @file types.ts
 * @description BCommandPanel 的 scope、source、结果项与暴露 API 类型定义。
 */
import type { VNodeChild } from 'vue';

/**
 * 命令面板打开入口的业务范围。
 */
export type CommandPanelScope = 'recent' | 'model';

/**
 * 命令面板 source 标识。
 */
export type CommandPanelSourceId = 'recent' | 'model' | 'jump';

/**
 * 输入路由解析结果。
 */
export interface CommandPanelQueryRoute {
  /** 当前输入应使用的 source。 */
  sourceId: CommandPanelSourceId;
  /** 传给 source 的搜索词。 */
  keyword: string;
}

/**
 * 图标渲染上下文。
 */
export interface CommandPanelIconContext {
  /** 图标元素应附加的类名。 */
  className: string;
  /** 图标尺寸。 */
  size: number;
}

/**
 * 命令面板结果项类型。
 */
export type CommandPanelItemKind = 'file' | 'webview' | 'absolute-path' | 'url' | 'jump' | 'model';

/**
 * 命令面板结果项公共字段。
 */
export interface CommandPanelItemBase {
  /** 列表项唯一键。 */
  key: string;
  /** 列表项类型。 */
  kind: CommandPanelItemKind;
  /** 主标题。 */
  title: string;
  /** 描述信息，通常展示路径、URL 或命令说明。 */
  description?: string;
  /** 描述信息状态类。 */
  descriptionClass?: string;
  /** 右侧辅助文案。 */
  meta?: string;
  /** 是否为当前激活项。 */
  active?: boolean;
  /** 自定义图标渲染函数。 */
  renderIcon?: (context: CommandPanelIconContext) => VNodeChild;
}

/**
 * 执行动作的命令面板结果项。
 */
export interface CommandPanelActionItem extends CommandPanelItemBase {
  /** 非 jump 类型都必须提供选择动作。 */
  kind: Exclude<CommandPanelItemKind, 'jump'>;
  /** 是否展示删除按钮。 */
  removable?: boolean;
  /** 选择后是否关闭面板，默认关闭。 */
  closeOnSelect?: boolean;
  /** 选择结果项时执行的动作。 */
  onSelect: () => Promise<void> | void;
  /** 删除结果项时执行的动作。 */
  onRemove?: () => Promise<void> | void;
}

/**
 * 跳转语法结果项，由面板内部处理输入切换。
 */
export interface CommandPanelJumpItem extends CommandPanelItemBase {
  /** 跳转项固定类型。 */
  kind: 'jump';
  /** 不含尾空格的目标输入前缀。 */
  routeInput: string;
}

/**
 * 命令面板结果项。
 */
export type CommandPanelItem = CommandPanelActionItem | CommandPanelJumpItem;

/**
 * 命令面板结果分组。
 */
export interface CommandPanelGroup {
  /** 分组唯一键。 */
  key: string;
  /** 分组标题；为空时不展示标题。 */
  title?: string;
  /** 分组内结果项。 */
  items: CommandPanelItem[];
}

/**
 * 命令面板数据源接口。
 */
export interface CommandPanelSource {
  /** 数据源标识。 */
  id: CommandPanelSourceId;
  /** 加载 source 所需数据，必须可重复调用。 */
  load: () => Promise<void> | void;
  /** 按关键字返回结果分组。 */
  search: (keyword: string) => Promise<CommandPanelGroup[]> | CommandPanelGroup[];
}

/**
 * 命令面板打开参数。
 */
export interface OpenCommandPanelOptions {
  /** 面板关闭后的运行时回调。 */
  onClose?: () => void;
}
```

- [ ] **Step 4: Implement the pure query parser**

Create `src/components/BCommandPanel/utils/query.ts`:

```ts
/**
 * @file query.ts
 * @description 解析 BCommandPanel 输入内容，决定当前应使用的 source 与搜索词。
 */
import type { CommandPanelQueryRoute, CommandPanelScope } from '../types';

const JUMP_PREFIX = '>';
const MODEL_COMMAND = 'model';

/**
 * 解析命令面板当前输入。
 * @param scope - 打开入口范围
 * @param input - 输入框原始内容
 * @returns source 路由和搜索词
 */
export function parseCommandPanelQuery(scope: CommandPanelScope, input: string): CommandPanelQueryRoute {
  const value = input.trim();

  if (scope === 'model') {
    return { sourceId: 'model', keyword: value };
  }

  if (!value.startsWith(JUMP_PREFIX)) {
    return { sourceId: 'recent', keyword: value };
  }

  const jumpBody = value.slice(JUMP_PREFIX.length).trimStart();
  const modelMatch = /^model(?:\s+(.*)|\s*)$/.exec(jumpBody);

  if (modelMatch) {
    return { sourceId: 'model', keyword: (modelMatch[1] ?? '').trim() };
  }

  return { sourceId: 'jump', keyword: jumpBody.trim() };
}
```

- [ ] **Step 5: Run parser tests and verify they pass**

Run:

```bash
pnpm test test/components/BCommandPanel/query.test.ts
```

Expected: PASS.

## Task 2: Command Sources

**Files:**
- Create: `src/components/BCommandPanel/sources/jump.ts`
- Create: `src/components/BCommandPanel/sources/recent.ts`
- Create: `src/components/BCommandPanel/sources/model.ts`
- Create: `test/components/BCommandPanel/sources.test.ts`

- [ ] **Step 1: Write failing source tests**

Create `test/components/BCommandPanel/sources.test.ts` with these cases:

```ts
/**
 * @file sources.test.ts
 * @description 验证 BCommandPanel 三类 source 的结果生成与行为绑定。
 * @vitest-environment jsdom
 */
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJumpSource } from '@/components/BCommandPanel/sources/jump';
import { createModelSource } from '@/components/BCommandPanel/sources/model';
import { createRecentSource } from '@/components/BCommandPanel/sources/recent';
import type { CommandPanelActionItem } from '@/components/BCommandPanel/types';
import type { RecentRecord } from '@/shared/storage';

const openFileMock = vi.fn<(_record: Extract<RecentRecord, { type: 'file' }>) => Promise<void>>();
const openFileByPathMock = vi.fn<(_path: string) => Promise<void>>();
const openWebviewMock = vi.fn<(_url: URL) => void>();
const removeFileMock = vi.fn<(_id: string) => Promise<void>>();
const removeTabMock = vi.fn<(_id: string) => void>();
const getPathStatusMock = vi.fn<(_path: string) => Promise<{ exists: boolean; isFile: boolean }>>();
const loadProvidersMock = vi.fn<() => Promise<void>>();
const loadChatModelMock = vi.fn<() => Promise<void>>();
const setChatModelMock = vi.fn<(_model: { providerId: string; modelId: string }) => Promise<void>>();

/**
 * 创建文件最近记录。
 * @param overrides - 覆盖字段
 * @returns 文件最近记录
 */
function fileRecord(overrides: Partial<Extract<RecentRecord, { type: 'file' }>> = {}): Extract<RecentRecord, { type: 'file' }> {
  return {
    type: 'file',
    id: 'file-1',
    path: '/tmp/example.md',
    content: '',
    name: 'example',
    ext: 'md',
    ...overrides
  };
}

describe('BCommandPanel sources', (): void => {
  beforeEach((): void => {
    openFileMock.mockReset();
    openFileByPathMock.mockReset();
    openWebviewMock.mockReset();
    removeFileMock.mockReset();
    removeTabMock.mockReset();
    getPathStatusMock.mockReset();
    loadProvidersMock.mockResolvedValue(undefined);
    loadChatModelMock.mockResolvedValue(undefined);
    setChatModelMock.mockResolvedValue(undefined);
  });

  it('filters jump commands and exposes routeInput without trailing space', (): void => {
    const source = createJumpSource();

    expect(source.search('')).toEqual([
      {
        key: 'jump',
        title: '跳转',
        items: [
          {
            key: 'jump:model',
            title: '> model',
            kind: 'jump',
            description: '切换当前使用的模型',
            routeInput: '> model',
            renderIcon: expect.any(Function)
          }
        ]
      }
    ]);
    expect(source.search('mo')[0]?.items[0]?.key).toBe('jump:model');
    expect(source.search('models')).toEqual([{ key: 'jump', title: '跳转', items: [] }]);
  });

  it('creates recent file, url, and absolute path items', async (): Promise<void> => {
    getPathStatusMock.mockResolvedValue({ exists: true, isFile: true });
    const source = createRecentSource({
      getRecords: () => [fileRecord()],
      ensureLoaded: vi.fn(),
      openFile: openFileMock,
      openFileByPath: openFileByPathMock,
      openWebview: openWebviewMock,
      removeRecent: removeFileMock,
      removeTab: removeTabMock,
      getPathStatus: getPathStatusMock,
      renderRecentIcon: () => h('span', { class: 'recent-icon-stub' })
    });

    const urlGroups = await source.search('https://example.com/docs');
    expect(urlGroups[0].items[0]).toMatchObject({ kind: 'url', title: 'example.com', description: 'https://example.com/docs' });

    const pathGroups = await source.search('/tmp/sketch.md');
    expect(pathGroups[0].items[0]).toMatchObject({ kind: 'absolute-path', title: 'sketch.md', description: '/tmp/sketch.md', meta: '按路径打开' });

    const fileItem = pathGroups[0].items.find((item) => item.kind === 'file') as CommandPanelActionItem | undefined;
    expect(fileItem?.removable).toBe(true);
    await fileItem?.onRemove?.();
    expect(removeFileMock).toHaveBeenCalledWith('file-1');
    expect(removeTabMock).toHaveBeenCalledWith('file-1');
  });

  it('creates model groups and marks current chat model active', async (): Promise<void> => {
    const source = createModelSource({
      loadProviders: loadProvidersMock,
      loadChatModel: loadChatModelMock,
      setChatModel: setChatModelMock,
      getAvailableModels: () => [
        {
          providerId: 'openai',
          providerName: 'OpenAI',
          models: [
            { value: 'openai:gpt-4o', modelId: 'gpt-4o', modelName: 'GPT 4o' },
            { value: 'openai:gpt-4.1', modelId: 'gpt-4.1', modelName: 'GPT 4.1' }
          ]
        }
      ],
      getCurrentModel: () => ({ providerId: 'openai', modelId: 'gpt-4o' }),
      renderModelIcon: () => h('span', { class: 'model-icon-stub' })
    });

    await source.load();
    const groups = await source.search('4o');

    expect(loadProvidersMock).toHaveBeenCalled();
    expect(loadChatModelMock).toHaveBeenCalled();
    expect(groups[0]).toMatchObject({ key: 'openai', title: 'OpenAI' });
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0]).toMatchObject({ kind: 'model', title: 'GPT 4o', active: true });
  });
});
```

- [ ] **Step 2: Run source tests and verify they fail**

Run:

```bash
pnpm test test/components/BCommandPanel/sources.test.ts
```

Expected: FAIL because the source files do not exist.

- [ ] **Step 3: Implement `jumpSource`**

Create `src/components/BCommandPanel/sources/jump.ts` with a source returning group key `jump` and a single model jump item. The item title is `model`, hides the left icon, and stores `routeInput: '> model'`; the visible row must not render the `>` prefix.

The exported function must be:

```ts
/**
 * 创建跳转语法 source。
 * @returns 跳转命令 source
 */
export function createJumpSource(): CommandPanelSource;
```

- [ ] **Step 4: Implement `recentSource`**

Create `src/components/BCommandPanel/sources/recent.ts` with dependency injection so tests do not need Pinia:

```ts
/**
 * 最近记录 source 依赖。
 */
export interface RecentSourceDeps {
  getRecords: () => RecentRecord[];
  ensureLoaded: () => Promise<void> | void;
  openFile: (record: StoredFile) => Promise<void>;
  openFileByPath: (path: string) => Promise<void>;
  openWebview: (url: URL) => void;
  removeRecent: (id: string) => Promise<void>;
  removeTab: (id: string) => void;
  getPathStatus: (path: string) => Promise<{ exists: boolean; isFile: boolean }>;
  renderRecentIcon: (item: RecentIconRenderInput, context: CommandPanelIconContext) => VNodeChild;
}
```

Implementation requirements:

- `load()` calls `ensureLoaded()`.
- `search(keyword)` returns `[{ key: 'recent', items }]`.
- Plain keyword search filters file records by `resolveFileTitle(record)`, `record.name`, `record.ext`, `record.path`, and `record.content`; filters webview records by `record.url` and `record.title`.
- URL input matching `/^https?:\/\//i` creates a `url` item before recent records.
- Absolute path input matching `value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value)` calls a debounced path-status helper and creates an `absolute-path` item only when the path exists and is a file.
- File items set `descriptionClass: 'is-unsaved'` when `record.path` is empty.
- File and webview items set `removable: true` and `onRemove()` calls `removeRecent(id)`; file items also call `removeTab(id)`.

- [ ] **Step 5: Implement `modelSource`**

Create `src/components/BCommandPanel/sources/model.ts` with dependency injection:

```ts
/**
 * 模型 source 依赖。
 */
export interface ModelSourceDeps {
  loadProviders: () => Promise<void>;
  loadChatModel: () => Promise<void>;
  setChatModel: (model: SelectedModel) => Promise<void>;
  getAvailableModels: () => ModelGroup[];
  getCurrentModel: () => SelectedModel | undefined;
  renderModelIcon: (model: { providerId: string; modelId: string }, context: CommandPanelIconContext) => VNodeChild;
}
```

Implementation requirements:

- `load()` calls both `loadProviders()` and `loadChatModel()`.
- `search(keyword)` filters by `providerName`, `modelName`, and `modelId`, all lower-cased.
- Each provider group uses `key: providerId` and `title: providerName`.
- Each model item uses `key: value`, `kind: 'model'`, `title: modelName`, `description: modelId`, and `active` from `getCurrentModel()`.
- `onSelect()` parses `providerId:modelId` and calls `setChatModel({ providerId, modelId })`.

- [ ] **Step 6: Run source tests and verify they pass**

Run:

```bash
pnpm test test/components/BCommandPanel/sources.test.ts
```

Expected: PASS.

## Task 3: BCommandPanel Component

**Files:**
- Create: `src/components/BCommandPanel/index.vue`
- Create: `test/components/BCommandPanel/index.test.ts`

- [ ] **Step 1: Write failing component tests**

Create `test/components/BCommandPanel/index.test.ts` with Vue Test Utils stubs for `BModal`, `BScrollbar`, `AInput`, `BRecentIcon`, `BModelIcon`, and `BIcon`. Cover:

```ts
/**
 * @file index.test.ts
 * @description 验证 BCommandPanel 弹窗、输入路由、键盘导航和选择行为。
 * @vitest-environment jsdom
 */
```

Required assertions:

- recent scope open renders recent records and calls `recentStore.ensureLoaded()`.
- input `>` renders a `model` jump item without icon or `>` prefix.
- selecting `model` keeps the modal open, sets input value to `> model `, and renders model items.
- deleting back to `> mo` renders jump commands again.
- model scope open renders only model items.
- model scope input `>` does not render jump commands.
- ArrowDown and ArrowUp cycle active class `b-command-panel__item--active`.
- clicking a delete button calls the recent item remove handler and keeps modal open.
- selecting a model calls `serviceModelStore.setChatModel()` and triggers the configured `onClose` callback.
- empty jump search renders `没有匹配的跳转命令`.

- [ ] **Step 2: Run component tests and verify they fail**

Run:

```bash
pnpm test test/components/BCommandPanel/index.test.ts
```

Expected: FAIL because `src/components/BCommandPanel/index.vue` does not exist.

- [ ] **Step 3: Implement `BCommandPanel/index.vue`**

Create the component with:

- `<BModal v-model:open="visible" :mask-closable="true" :width="560" :main-style="{ padding: '10px 0 0 10px' }">`
- `AInput` bound to `keyword`
- `BScrollbar` wrapping grouped result rows
- `button` rows with stable class names:
  - `.b-command-panel`
  - `.b-command-panel__toolbar`
  - `.b-command-panel__list`
  - `.b-command-panel__group-title`
  - `.b-command-panel__item`
  - `.b-command-panel__item--active`
  - `.b-command-panel__item-icon`
  - `.b-command-panel__item-title`
  - `.b-command-panel__item-description`
  - `.b-command-panel__item-description--unsaved`
  - `.b-command-panel__item-meta`
  - `.b-command-panel__item-delete`
  - `.b-command-panel__empty`

Script requirements:

- Read `visible`, `scope`, and `keyword` from `useCommandPanelStore` via `storeToRefs`.
- A `computed` or watcher uses `parseCommandPanelQuery(scope, keyword)` to choose the active source.
- `source.load()` is called before `source.search(route.keyword)`, with both calls wrapped so synchronous and asynchronous failures clear stale results.
- A component-level request token ignores stale `search()` results.
- `handleSelectItem(item)`:
  - for `kind === 'jump'`, calls `commandPanelStore.setKeyword(`${item.routeInput} `)` and keeps the modal open.
  - for action items, awaits `item.onSelect()` and closes through `commandPanelStore.close()` if `item.closeOnSelect !== false`.
- Template click handlers call synchronous safe wrappers that use `asyncTo()` so rejected item actions do not surface as Vue native event errors.
- `handleRemoveItem(item)` awaits `item.onRemove?.()`, keeps modal open, and refreshes results through the same guarded refresh path.
- Keyboard behavior matches the spec.

Style requirements:

- Keep rows compact, close to the current `BRecent` sizing.
- Do not use Less `&__child` class abbreviation; write full selectors.
- Use `&:hover` and `&.is-*` only for allowed pseudo/modifier cases.

- [ ] **Step 4: Run component tests and verify they pass**

Run:

```bash
pnpm test test/components/BCommandPanel/index.test.ts
```

Expected: PASS.

## Task 4: Integration Migration

**Files:**
- Modify: `src/layouts/default/index.vue`
- Modify: `src/views/welcome/index.vue`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/layouts/default/index-chat-sider-loading.test.ts`
- Modify: `test/views/welcome/recent-loading.test.ts`
- Add or modify: `test/components/BChat/command-panel-model-entry.test.ts`

- [ ] **Step 1: Update global-entry tests first**

Change expectations:

```ts
expect(defaultLayoutSource).toContain("import BCommandPanel from '@/components/BCommandPanel/index.vue';");
expect(defaultLayoutSource).toContain('<BCommandPanel />');
expect(defaultLayoutSource).toContain('commandPanelStore.openRecent()');
expect(defaultLayoutSource).not.toContain("defineAsyncComponent(() => import('@/components/BRecent/index.vue'))");
```

For welcome:

```ts
expect(welcomePageSource).toContain("import { useCommandPanelStore } from '@/stores/ui/commandPanel';");
expect(welcomePageSource).toContain('commandPanelStore.openRecent()');
expect(welcomePageSource).not.toContain('<BCommandPanel');
expect(welcomePageSource).not.toContain("import BCommandPanel from '@/components/BCommandPanel/index.vue'");
expect(welcomePageSource).not.toContain("defineAsyncComponent(() => import('@/components/BRecent/index.vue'))");
```

Run:

```bash
pnpm test test/layouts/default/index-chat-sider-loading.test.ts test/views/welcome/recent-loading.test.ts
```

Expected: FAIL until integration files are changed.

- [ ] **Step 2: Migrate default layout recent entry**

In `src/layouts/default/index.vue`:

- Import `BCommandPanel` directly and mount one `<BCommandPanel />` near other global overlays.
- Add `const commandPanelStore = useCommandPanelStore();`.
- Replace search-button and file-menu recent entry actions with `commandPanelStore.openRecent()`.
- Remove the old local `visible.searchRecent` state and lazy `BRecent` component.

- [ ] **Step 3: Migrate welcome recent entry**

In `src/views/welcome/index.vue`:

- Add `const commandPanelStore = useCommandPanelStore();`.
- Replace the local recent-modal state and component with `commandPanelStore.openRecent()`.
- Do not import or mount `BCommandPanel` in the welcome page; the default layout owns the global instance.

- [ ] **Step 4: Migrate chat global model entry**

In `src/components/BChat/index.vue`:

- Add `const commandPanelStore = useCommandPanelStore();`.
- Replace the old `BModelSelect` modal state/ref with:

```ts
commandPanelStore.openModel({
  onClose: () => promptEditorRef.value?.focus()
});
```

- Remove `handleGlobalModelChange()` if it no longer has callers; model selection is handled inside `modelSource`.

- [ ] **Step 5: Add chat entry source-string test**

Create `test/components/BChat/command-panel-model-entry.test.ts`:

```ts
/**
 * @file command-panel-model-entry.test.ts
 * @description 验证 BChat 全局模型入口使用 BCommandPanel 的模型 scope。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatSource = readFileSync(new URL('../../../src/components/BChat/index.vue', import.meta.url), 'utf8');

describe('BChat command panel model entry', (): void => {
  it('opens BCommandPanel in model scope for global model selection', (): void => {
    expect(chatSource).toContain("import { useCommandPanelStore } from '@/stores/ui/commandPanel';");
    expect(chatSource).toContain('const commandPanelStore = useCommandPanelStore();');
    expect(chatSource).toContain('commandPanelStore.openModel({');
    expect(chatSource).toContain('onClose: () => promptEditorRef.value?.focus()');
    expect(chatSource).not.toContain('<BCommandPanel');
    expect(chatSource).not.toContain("import BModelSelect from '@/components/BModel/select.vue';");
    expect(chatSource).not.toContain('modelSelectOpen');
  });
});
```

- [ ] **Step 6: Run integration tests**

Run:

```bash
pnpm test test/layouts/default/index-chat-sider-loading.test.ts test/views/welcome/recent-loading.test.ts test/components/BChat/command-panel-model-entry.test.ts
```

Expected: PASS.

## Task 5: Remove Replaced Dialogs and Update Coverage

**Files:**
- Delete or convert: `src/components/BRecent/index.vue`
- Keep: `src/components/BRecent/Icon.vue`
- Delete or convert: `src/components/BRecent/types.ts`
- Delete or convert: `src/components/BModel/select.vue`
- Keep: `src/components/BModel/Icon.vue`
- Keep or reduce: `src/components/BModel/types.ts`
- Modify: `test/components/BRecent/recent.component.test.ts`
- Update any imports found by `rg "BRecent/index.vue|BModel/select.vue|BModelSelect|BRecent v-if" src test`

- [ ] **Step 1: Search for old component references**

Run:

```bash
rg -n "BRecent/index.vue|BModel/select.vue|BModelSelect|<BRecent|modelSelectRef|modelSelectOpen" src test
```

Expected before cleanup: only references intentionally left during migration.

- [ ] **Step 2: Remove or convert old dialog files**

If no source imports remain:

- Delete `src/components/BRecent/index.vue`.
- Delete `src/components/BRecent/types.ts` if no imports remain.
- Delete `src/components/BModel/select.vue`.
- Keep `src/components/BModel/types.ts` only if `SelectedModel`, `ModelItem`, or `ModelGroup` re-export paths are still used; otherwise remove unused dialog-specific interfaces from it.

Use `apply_patch` for these deletes.

- [ ] **Step 3: Move recent behavior tests to command panel tests**

In `test/components/BRecent/recent.component.test.ts`, either remove the file if all behavior has moved, or rewrite it to target `BCommandPanel`. Coverage that must remain somewhere:

- candidate icons for URL and absolute path input
- stored webview favicon usage through `BRecentIcon`
- delete action hidden until hover, if the style lives in `BCommandPanel`
- keyboard highlight cycling
- late path candidate does not break active row

Run:

```bash
pnpm test test/components/BRecent/icon.test.ts test/components/BCommandPanel/index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Verify no old dialog references remain**

Run:

```bash
rg -n "BRecent/index.vue|BModel/select.vue|BModelSelect|<BRecent|modelSelectRef|modelSelectOpen" src test
```

Expected: no output.

## Task 6: Changelog and Full Verification

**Files:**
- Modify: `changelog/2026-06-24.md`

- [ ] **Step 1: Update changelog**

Add under `Changed` in `changelog/2026-06-24.md`:

```md
- 新增统一命令面板 `BCommandPanel`，整合最近记录搜索与全局模型选择入口；最近入口支持 `>` 跳转到模型选择，聊天模型入口保持仅搜索模型。
```

If the file lacks a `Changed` heading, add it using the existing changelog format.

- [ ] **Step 2: Run focused test suite**

Run:

```bash
pnpm test test/components/BCommandPanel/query.test.ts test/components/BCommandPanel/sources.test.ts test/components/BCommandPanel/index.test.ts test/components/BRecent/icon.test.ts test/layouts/default/index-chat-sider-loading.test.ts test/views/welcome/recent-loading.test.ts test/components/BChat/command-panel-model-entry.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: ESLint completes. It may modify files because the repo command uses `--fix`; inspect changes afterward.

- [ ] **Step 5: Run style lint**

Run:

```bash
pnpm lint:style
```

Expected: Stylelint completes. It may modify files because the repo command uses `--fix`; inspect changes afterward.

- [ ] **Step 6: Check final working tree**

Run:

```bash
git status --short
```

Expected: modified/created files for this feature only. No files are staged and no commit has been created.

## Self-Review

Spec coverage:

- Recent scope defaults to recent records: Task 3 and Task 4.
- `>` jump commands and `> model` routing: Task 1, Task 2, Task 3.
- Deleting from `> model` back to `> mo`: Task 1 and Task 3.
- Chat model entry locked to model search: Task 3 and Task 4.
- Unified modal, input, list, keyboard, empty states: Task 3.
- Source contracts and icon rendering: Task 2 and Task 3.
- Active model source: Task 2 and Task 3.
- URL/path candidates and stale async handling: Task 2 and Task 3.
- Delete recent record behavior: Task 2 and Task 3.
- Changelog: Task 6.

Placeholder scan:

- This plan contains no placeholder markers or incomplete task instructions.

Type consistency:

- `CommandPanelScope`, `CommandPanelSourceId`, `CommandPanelGroup`, `CommandPanelItem`, `CommandPanelSource`, and `BCommandPanelExpose` are defined before later tasks use them.
- `routeInput` is only present on jump items and is handled by the panel, not by a source action.
- `closeOnSelect` exists only on action items.
