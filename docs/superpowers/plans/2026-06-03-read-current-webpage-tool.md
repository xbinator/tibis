# Current Webpage Read Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `read_current_webpage` AI tool that is only available when a WebView tab is active and returns a privacy-trimmed snapshot of the current webpage.

**Architecture:** Add a WebView tool context registry, expose a navigation-aware `readPageSnapshot()` method from the `<webview>` controller, register the active WebView page from `src/views/webview/web/index.vue`, and inject the active context into the builtin tool factory. The chat sidebar keeps using runtime tool filtering, so the model only receives the tool when an active WebView context exists.

**Tech Stack:** Vue 3 Composition API, Electron `<webview>.executeJavaScript`, TypeScript strict mode, Vitest.

---

## File Structure

- Create `src/ai/tools/context/webview.ts`: WebView context types and active context registry.
- Create `src/ai/tools/builtin/WebpageTool/index.ts`: `read_current_webpage` builtin read tool.
- Modify `src/views/webview/web/hooks/useWebView.ts`: page snapshot script, validation, timeout, concurrent read reuse.
- Modify `src/views/webview/web/index.vue`: register/unregister active WebView context and set/clear current on activation.
- Modify `src/ai/tools/builtin/index.ts`: export tool name, include it in builtin lists, accept `getWebviewContext`.
- Modify `src/components/BChatSidebar/index.vue`: inject `getWebviewContext` and filter the tool when no active WebView exists.
- Create `test/ai/tools/webview-context.test.ts`: registry behavior tests.
- Create `test/ai/tools/builtin-webpage.test.ts`: builtin tool behavior tests.
- Create `test/views/webview-web-snapshot.test.ts`: snapshot script and controller behavior tests.
- Modify `test/ai/tools/builtin-index.test.ts`: builtin factory inclusion/export tests.
- Modify or create a focused BChatSidebar tool-filter test if an existing mount test can expose `getActiveTools`; otherwise cover filtering through `createBuiltinTools` plus registry tests.
- Modify `changelog/2026-06-03.md`: add Changed/Features entry for the new tool.

---

### Task 1: WebView Tool Context Registry

**Files:**
- Create: `src/ai/tools/context/webview.ts`
- Test: `test/ai/tools/webview-context.test.ts`

- [ ] **Step 1: Write the failing registry tests**

Create `test/ai/tools/webview-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createWebviewToolContextRegistry, type WebviewToolContext } from '@/ai/tools/context/webview';

/**
 * 创建测试用 WebView 工具上下文。
 * @param url - 页面 URL
 * @returns WebView 工具上下文
 */
function createContext(url: string): WebviewToolContext {
  return {
    readPageSnapshot: async () => ({
      url,
      title: `Title ${url}`,
      text: `Text ${url}`,
      selectedText: '',
      headings: [],
      links: [],
      capturedAt: 1,
      truncated: {
        text: false,
        headings: false,
        links: false,
        selectedText: false
      }
    })
  };
}

describe('webview tool context registry', () => {
  it('returns undefined when no current WebView exists', () => {
    const registry = createWebviewToolContextRegistry();

    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('returns the explicitly current context', async () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.register('tab-2', createContext('https://two.example'));
    registry.setCurrent('tab-1');

    await expect(registry.getCurrentContext()?.readPageSnapshot()).resolves.toMatchObject({
      url: 'https://one.example'
    });
  });

  it('does not switch current context on register alone', () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.setCurrent('tab-1');
    registry.register('tab-2', createContext('https://two.example'));

    expect(registry.getCurrentContext()).toBeDefined();
  });

  it('clears only the matching current context', () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.register('tab-2', createContext('https://two.example'));
    registry.setCurrent('tab-1');
    registry.clearCurrent('tab-2');

    expect(registry.getCurrentContext()).toBeDefined();

    registry.clearCurrent('tab-1');

    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('unregister removes the current context', () => {
    const registry = createWebviewToolContextRegistry();

    registry.register('tab-1', createContext('https://one.example'));
    registry.setCurrent('tab-1');
    registry.unregister('tab-1');

    expect(registry.getCurrentContext()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the failing registry tests**

Run: `pnpm test test/ai/tools/webview-context.test.ts`

Expected: FAIL because `@/ai/tools/context/webview` does not exist.

- [ ] **Step 3: Implement the registry**

Create `src/ai/tools/context/webview.ts`:

```ts
/**
 * @file webview-context.ts
 * @description WebView 工具上下文注册表，管理当前激活网页的读取能力。
 */

/**
 * WebView 页面标题节点。
 */
export interface WebviewPageHeading {
  /** 标题层级，1 到 6。 */
  level: number;
  /** 标题文本。 */
  text: string;
}

/**
 * WebView 页面链接。
 */
export interface WebviewPageLink {
  /** 链接文本。 */
  text: string;
  /** 解析后的链接地址。 */
  href: string;
}

/**
 * WebView 页面字段截断标记。
 */
export interface WebviewPageTruncation {
  /** 正文是否被截断。 */
  text: boolean;
  /** 标题列表是否被截断。 */
  headings: boolean;
  /** 链接列表是否被截断。 */
  links: boolean;
  /** 选中文本是否被截断。 */
  selectedText: boolean;
}

/**
 * WebView 页面快照。
 */
export interface WebviewPageSnapshot {
  /** 页面地址。 */
  url: string;
  /** 页面标题。 */
  title: string;
  /** 可见正文。 */
  text: string;
  /** 当前页面选中文本。 */
  selectedText: string;
  /** 页面标题结构。 */
  headings: WebviewPageHeading[];
  /** 页面链接列表。 */
  links: WebviewPageLink[];
  /** 快照采集时间戳。 */
  capturedAt: number;
  /** 各字段截断状态。 */
  truncated: WebviewPageTruncation;
}

/**
 * WebView 工具上下文。
 */
export interface WebviewToolContext {
  /**
   * 读取当前网页快照。
   * @returns 当前网页快照
   */
  readPageSnapshot(): Promise<WebviewPageSnapshot>;
}

/**
 * WebView 工具上下文注册表。
 */
export interface WebviewToolContextRegistry {
  /**
   * 注册 WebView 上下文。
   * @param id - WebView 标签页标识
   * @param context - WebView 工具上下文
   */
  register(id: string, context: WebviewToolContext): void;
  /**
   * 注销 WebView 上下文。
   * @param id - WebView 标签页标识
   */
  unregister(id: string): void;
  /**
   * 标记当前激活 WebView。
   * @param id - WebView 标签页标识
   */
  setCurrent(id: string): void;
  /**
   * 清理当前激活 WebView。
   * @param id - WebView 标签页标识
   */
  clearCurrent(id: string): void;
  /**
   * 获取当前激活 WebView 上下文。
   * @returns 当前上下文或 undefined
   */
  getCurrentContext(): WebviewToolContext | undefined;
}

/**
 * 创建 WebView 工具上下文注册表。
 * @returns WebView 工具上下文注册表
 */
export function createWebviewToolContextRegistry(): WebviewToolContextRegistry {
  /** WebView 标签页 ID 到上下文的映射。 */
  const contexts = new Map<string, WebviewToolContext>();
  /** 当前激活 WebView 标签页 ID。 */
  let currentId: string | null = null;

  return {
    register(id: string, context: WebviewToolContext): void {
      contexts.set(id, context);
    },
    unregister(id: string): void {
      contexts.delete(id);
      if (currentId === id) {
        currentId = null;
      }
    },
    setCurrent(id: string): void {
      if (contexts.has(id)) {
        currentId = id;
      }
    },
    clearCurrent(id: string): void {
      if (currentId === id) {
        currentId = null;
      }
    },
    getCurrentContext(): WebviewToolContext | undefined {
      return currentId ? contexts.get(currentId) : undefined;
    }
  };
}

/** 全局 WebView 工具上下文注册表单例。 */
export const webviewToolContextRegistry = createWebviewToolContextRegistry();
```

- [ ] **Step 4: Run the registry tests**

Run: `pnpm test test/ai/tools/webview-context.test.ts`

Expected: PASS.

---

### Task 2: Page Snapshot Reader

**Files:**
- Modify: `src/views/webview/web/hooks/useWebView.ts`
- Test: `test/views/webview-web-snapshot.test.ts`

- [ ] **Step 1: Write failing snapshot helper tests**

Create `test/views/webview-web-snapshot.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS,
  isWebviewPageSnapshot,
  normalizeWebviewPageSnapshot,
  withWebviewPageReadTimeout
} from '@/views/webview/web/hooks/useWebView';

describe('webview page snapshot helpers', () => {
  it('normalizes and marks truncated fields separately', () => {
    const value = normalizeWebviewPageSnapshot({
      url: 'https://example.com',
      title: 'Example',
      text: 'a'.repeat(20001),
      selectedText: 'b'.repeat(4001),
      headings: Array.from({ length: 121 }, (_, index) => ({ level: 1, text: `Heading ${index}` })),
      links: Array.from({ length: 101 }, (_, index) => ({ text: `Link ${index}`, href: `https://example.com/${index}` }))
    });

    expect(value.text).toHaveLength(20000);
    expect(value.selectedText).toHaveLength(4000);
    expect(value.headings).toHaveLength(120);
    expect(value.links).toHaveLength(100);
    expect(value.truncated).toEqual({
      text: true,
      headings: true,
      links: true,
      selectedText: true
    });
  });

  it('rejects invalid snapshot values', () => {
    expect(isWebviewPageSnapshot({ url: 1 })).toBe(false);
    expect(isWebviewPageSnapshot({ url: 'https://example.com', title: 'x', text: 'x', selectedText: '', headings: [], links: [] })).toBe(true);
  });

  it('times out slow page reads', async () => {
    vi.useFakeTimers();
    const promise = withWebviewPageReadTimeout(new Promise(() => undefined));

    await vi.advanceTimersByTimeAsync(WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS);

    await expect(promise).rejects.toThrow('页面读取超时');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the failing snapshot tests**

Run: `pnpm test test/views/webview-web-snapshot.test.ts`

Expected: FAIL because exported helper functions do not exist.

- [ ] **Step 3: Add snapshot constants, validators, timeout helper, and script builder**

Modify `src/views/webview/web/hooks/useWebView.ts` near the existing constants:

```ts
import type { WebviewPageHeading, WebviewPageLink, WebviewPageSnapshot, WebviewPageTruncation } from '@/ai/tools/context/webview';
```

Add:

```ts
/** 页面正文最大字符数。 */
export const WEBVIEW_PAGE_TEXT_LIMIT = 20000;
/** 页面标题最大数量。 */
export const WEBVIEW_PAGE_HEADING_LIMIT = 120;
/** 页面链接最大数量。 */
export const WEBVIEW_PAGE_LINK_LIMIT = 100;
/** 页面选中文本最大字符数。 */
export const WEBVIEW_PAGE_SELECTED_TEXT_LIMIT = 4000;
/** 页面读取超时时间。 */
export const WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS = 10000;

/**
 * 判断值是否为页面标题数组。
 * @param value - 待判断的值
 * @returns 是否为页面标题数组
 */
function isHeadingArray(value: unknown): value is WebviewPageHeading[] {
  return Array.isArray(value) && value.every((item) => Boolean(item) && typeof item === 'object' && typeof (item as Partial<WebviewPageHeading>).level === 'number' && typeof (item as Partial<WebviewPageHeading>).text === 'string');
}

/**
 * 判断值是否为页面链接数组。
 * @param value - 待判断的值
 * @returns 是否为页面链接数组
 */
function isLinkArray(value: unknown): value is WebviewPageLink[] {
  return Array.isArray(value) && value.every((item) => Boolean(item) && typeof item === 'object' && typeof (item as Partial<WebviewPageLink>).text === 'string' && typeof (item as Partial<WebviewPageLink>).href === 'string');
}

/**
 * 判断值是否为未裁剪的页面快照。
 * @param value - 待判断的值
 * @returns 是否为页面快照
 */
export function isWebviewPageSnapshot(value: unknown): value is Omit<WebviewPageSnapshot, 'capturedAt' | 'truncated'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<WebviewPageSnapshot>;
  return (
    typeof snapshot.url === 'string' &&
    typeof snapshot.title === 'string' &&
    typeof snapshot.text === 'string' &&
    typeof snapshot.selectedText === 'string' &&
    isHeadingArray(snapshot.headings) &&
    isLinkArray(snapshot.links)
  );
}

/**
 * 裁剪字符串并返回截断标记。
 * @param value - 原始字符串
 * @param limit - 最大长度
 * @returns 裁剪结果
 */
function truncateText(value: string, limit: number): { value: string; truncated: boolean } {
  if (value.length <= limit) {
    return { value, truncated: false };
  }
  return { value: value.slice(0, limit), truncated: true };
}

/**
 * 规范化 WebView 页面快照。
 * @param value - 页面脚本返回值
 * @returns 带截断标记的页面快照
 */
export function normalizeWebviewPageSnapshot(value: Omit<WebviewPageSnapshot, 'capturedAt' | 'truncated'>): WebviewPageSnapshot {
  const text = truncateText(value.text, WEBVIEW_PAGE_TEXT_LIMIT);
  const selectedText = truncateText(value.selectedText, WEBVIEW_PAGE_SELECTED_TEXT_LIMIT);
  const headings = value.headings.slice(0, WEBVIEW_PAGE_HEADING_LIMIT).map((heading) => ({
    level: heading.level,
    text: truncateText(heading.text, 300).value
  }));
  const links = value.links.slice(0, WEBVIEW_PAGE_LINK_LIMIT).map((link) => ({
    text: truncateText(link.text, 300).value,
    href: link.href
  }));
  const truncated: WebviewPageTruncation = {
    text: text.truncated,
    headings: value.headings.length > WEBVIEW_PAGE_HEADING_LIMIT,
    links: value.links.length > WEBVIEW_PAGE_LINK_LIMIT,
    selectedText: selectedText.truncated
  };

  return {
    url: value.url,
    title: value.title,
    text: text.value,
    selectedText: selectedText.value,
    headings,
    links,
    capturedAt: Date.now(),
    truncated
  };
}

/**
 * 为页面读取 Promise 添加超时保护。
 * @param promise - 页面读取 Promise
 * @returns 带超时保护的 Promise
 */
export function withWebviewPageReadTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('页面读取超时')), WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

/**
 * 构建页面快照读取脚本。
 * @returns 可通过 executeJavaScript 执行的脚本
 */
function createPageSnapshotScript(): string {
  return `
(() => {
  const readText = (value) => String(value || '').trim();
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: readText(element.innerText || element.textContent)
  })).filter((item) => item.text);
  const links = Array.from(document.querySelectorAll('a[href]')).map((element) => ({
    text: readText(element.innerText || element.textContent || element.getAttribute('aria-label')),
    href: element.href
  })).filter((item) => item.href);

  return {
    url: location.href,
    title: document.title || '',
    text: readText(document.body ? document.body.innerText : ''),
    selectedText: readText(window.getSelection ? window.getSelection().toString() : ''),
    headings,
    links
  };
})();
`;
}
```

- [ ] **Step 4: Add `readPageSnapshot()` to `useWebView`**

Inside `useWebView`, add a local promise variable and method:

```ts
  let pendingPageSnapshotRead: Promise<WebviewPageSnapshot> | null = null;

  /**
   * 读取当前网页快照。
   * @returns 当前网页快照
   */
  async function readPageSnapshot(): Promise<WebviewPageSnapshot> {
    if (state.value.isLoading) {
      throw new Error('当前页面正在导航，请稍后重试');
    }

    if (pendingPageSnapshotRead) {
      return pendingPageSnapshotRead;
    }

    const instance = webviewRef.value;
    const executeJavaScript = instance?.executeJavaScript;
    if (!instance || typeof executeJavaScript !== 'function') {
      throw new Error('当前页面尚未准备好读取，请稍后重试');
    }

    pendingPageSnapshotRead = withWebviewPageReadTimeout(
      executeJavaScript.call(instance, createPageSnapshotScript()).then((value: unknown) => {
        if (!isWebviewPageSnapshot(value)) {
          throw new Error('页面快照格式无效');
        }
        return normalizeWebviewPageSnapshot(value);
      })
    ).finally(() => {
      pendingPageSnapshotRead = null;
    });

    return pendingPageSnapshotRead;
  }
```

Return `readPageSnapshot` from the `useWebView` return object.

- [ ] **Step 5: Run snapshot tests**

Run: `pnpm test test/views/webview-web-snapshot.test.ts`

Expected: PASS.

---

### Task 3: Builtin Webpage Tool

**Files:**
- Create: `src/ai/tools/builtin/WebpageTool/index.ts`
- Modify: `src/ai/tools/builtin/index.ts`
- Test: `test/ai/tools/builtin-webpage.test.ts`
- Test: `test/ai/tools/builtin-index.test.ts`

- [ ] **Step 1: Write failing tool tests**

Create `test/ai/tools/builtin-webpage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBuiltinWebpageTool, READ_CURRENT_WEBPAGE_TOOL_NAME } from '@/ai/tools/builtin/WebpageTool';
import type { WebviewToolContext } from '@/ai/tools/context/webview';

/**
 * 创建测试用 WebView 上下文。
 * @returns WebView 上下文
 */
function createContext(): WebviewToolContext {
  return {
    readPageSnapshot: async () => ({
      url: 'https://example.com',
      title: 'Example',
      text: 'Visible text',
      selectedText: 'Selected',
      headings: [{ level: 1, text: 'Heading' }],
      links: [{ text: 'Docs', href: 'https://example.com/docs' }],
      capturedAt: 1,
      truncated: {
        text: false,
        headings: false,
        links: false,
        selectedText: false
      }
    })
  };
}

describe('read_current_webpage tool', () => {
  it('returns failure when no WebView context exists', async () => {
    const tool = createBuiltinWebpageTool({ getWebviewContext: () => undefined });
    const result = await tool.execute({});

    expect(result.status).toBe('failure');
    expect(result.error?.message).toContain('当前没有可读取的 WebView 页面');
  });

  it('returns current webpage snapshot', async () => {
    const tool = createBuiltinWebpageTool({ getWebviewContext: () => createContext() });
    const result = await tool.execute({});

    expect(result.status).toBe('success');
    expect(result.toolName).toBe(READ_CURRENT_WEBPAGE_TOOL_NAME);
    expect(result.data).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      text: 'Visible text',
      selectedText: 'Selected'
    });
  });

  it('maps page read errors to tool failure', async () => {
    const tool = createBuiltinWebpageTool({
      getWebviewContext: () => ({
        readPageSnapshot: async () => {
          throw new Error('页面读取超时');
        }
      })
    });
    const result = await tool.execute({});

    expect(result.status).toBe('failure');
    expect(result.error?.message).toBe('页面读取超时');
  });
});
```

- [ ] **Step 2: Run failing tool tests**

Run: `pnpm test test/ai/tools/builtin-webpage.test.ts`

Expected: FAIL because `WebpageTool` does not exist.

- [ ] **Step 3: Implement `WebpageTool`**

Create `src/ai/tools/builtin/WebpageTool/index.ts`:

```ts
/**
 * @file WebpageTool/index.ts
 * @description 当前网页读取工具。
 */
import type { AIToolExecutor } from 'types/ai';
import type { WebviewPageSnapshot, WebviewToolContext } from '@/ai/tools/context/webview';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** 当前网页读取工具名称。 */
export const READ_CURRENT_WEBPAGE_TOOL_NAME = 'read_current_webpage';

/**
 * 当前网页读取工具选项。
 */
export interface CreateBuiltinWebpageToolOptions {
  /** 获取当前激活 WebView 上下文。 */
  getWebviewContext?: () => WebviewToolContext | undefined;
}

/**
 * 当前网页读取输入。
 */
export type ReadCurrentWebpageInput = Record<string, never>;

/**
 * 创建当前网页读取工具。
 * @param options - 工具创建选项
 * @returns 当前网页读取工具
 */
export function createBuiltinWebpageTool(options: CreateBuiltinWebpageToolOptions): AIToolExecutor<ReadCurrentWebpageInput, WebviewPageSnapshot> {
  return {
    definition: {
      name: READ_CURRENT_WEBPAGE_TOOL_NAME,
      description: '读取当前激活 WebView 网页的 URL、标题、可见文本、标题结构、链接列表和页面选中文本。',
      source: 'builtin',
      riskLevel: 'read',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    },
    async execute() {
      const context = options.getWebviewContext?.();
      if (!context) {
        return createToolFailureResult(READ_CURRENT_WEBPAGE_TOOL_NAME, 'EXECUTION_FAILED', '当前没有可读取的 WebView 页面');
      }

      try {
        const snapshot = await context.readPageSnapshot();
        return createToolSuccessResult(READ_CURRENT_WEBPAGE_TOOL_NAME, snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : '读取当前网页失败';
        return createToolFailureResult(READ_CURRENT_WEBPAGE_TOOL_NAME, 'EXECUTION_FAILED', message);
      }
    }
  };
}
```

- [ ] **Step 4: Wire builtin factory and exports**

Modify `src/ai/tools/builtin/index.ts`:

```ts
import { createBuiltinWebpageTool, READ_CURRENT_WEBPAGE_TOOL_NAME, type CreateBuiltinWebpageToolOptions } from './WebpageTool';
```

Add export:

```ts
export { READ_CURRENT_WEBPAGE_TOOL_NAME } from './WebpageTool';
```

Add to `DEFAULT_BUILTIN_READONLY_TOOL_NAMES`:

```ts
READ_CURRENT_WEBPAGE_TOOL_NAME,
```

Update `CreateBuiltinToolsOptions`:

```ts
interface CreateBuiltinToolsOptions extends BuiltinToolBaseOptions, CreateBuiltinWebpageToolOptions {
```

Add to `allReadonlyTools`:

```ts
createBuiltinWebpageTool({
  getWebviewContext: options.getWebviewContext
}),
```

- [ ] **Step 5: Update builtin index tests**

Modify `test/ai/tools/builtin-index.test.ts`:

```ts
import {
  READ_CURRENT_WEBPAGE_TOOL_NAME
} from '@/ai/tools/builtin';
```

Update default names expectation:

```ts
expect(getToolNames()).toEqual([
  'read_current_document',
  'read_current_webpage',
  'get_current_time',
  'question',
  'read_file',
  'get_settings',
  'query_logs',
  'todowrite',
  'create_document'
]);
```

Add export assertion:

```ts
expect(READ_CURRENT_WEBPAGE_TOOL_NAME).toBe('read_current_webpage');
```

- [ ] **Step 6: Run builtin tests**

Run:

```bash
pnpm test test/ai/tools/builtin-webpage.test.ts test/ai/tools/builtin-index.test.ts
```

Expected: PASS.

---

### Task 4: Register Active WebView Context

**Files:**
- Modify: `src/views/webview/web/index.vue`
- Test: covered by registry tests plus TypeScript check

- [ ] **Step 1: Import lifecycle helpers and registry**

Modify imports in `src/views/webview/web/index.vue`:

```ts
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, type CSSProperties } from 'vue';
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
```

- [ ] **Step 2: Register the context after `webview` is created**

After `const webview = useWebView(webviewElementRef);`, add:

```ts
webviewToolContextRegistry.register(routeFullPath, {
  readPageSnapshot: webview.readPageSnapshot
});
```

- [ ] **Step 3: Track active route state**

Add lifecycle hooks before `onBeforeUnmount`:

```ts
onMounted(() => {
  webviewToolContextRegistry.setCurrent(routeFullPath);
});

onActivated(() => {
  webviewToolContextRegistry.setCurrent(routeFullPath);
});

onDeactivated(() => {
  webviewToolContextRegistry.clearCurrent(routeFullPath);
});
```

Update existing `onBeforeUnmount` cleanup:

```ts
onBeforeUnmount(() => {
  webviewToolContextRegistry.unregister(routeFullPath);
  const element = webviewElementRef.value;
  if (element) {
    unbindWebviewEvents(element);
    element.parentElement?.remove();
    webviewElementRef.value = null;
  }
  offAttachRejected?.();
});
```

- [ ] **Step 4: Run TypeScript check for Vue file integration**

Run: `pnpm exec tsc --noEmit`

Expected: PASS or unrelated pre-existing errors only. If there are unrelated pre-existing errors, record them before continuing.

---

### Task 5: Chat Sidebar Tool Filtering

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`
- Test: `test/ai/tools/builtin-index.test.ts` and TypeScript check

- [ ] **Step 1: Import registry and tool name**

Modify imports in `src/components/BChatSidebar/index.vue`:

```ts
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
import { createBuiltinTools, isBuiltinToolName, READ_CURRENT_WEBPAGE_TOOL_NAME, READ_DIRECTORY_TOOL_NAME, SKILL_TOOL_NAME } from '@/ai/tools/builtin';
```

- [ ] **Step 2: Inject WebView context into `createBuiltinTools`**

Add to the `createBuiltinTools({ ... })` options object:

```ts
  getWebviewContext: () => webviewToolContextRegistry.getCurrentContext(),
```

- [ ] **Step 3: Filter the tool at runtime**

Update `getActiveTools()`:

```ts
function getActiveTools(): AIToolExecutor[] {
  const hasActiveEditor = Boolean(editorToolContextRegistry.getCurrentContext());
  const hasActiveWebview = Boolean(webviewToolContextRegistry.getCurrentContext());
  const hasWorkspace = Boolean(workspaceRoot.value);

  const dynamicTools: AIToolExecutor[] = [];
  if (skillStore.initialized && skillStore.getEnabledSkills().length > 0) {
    const hasSkillTool = allBuiltinTools.some((t) => t.definition.name === SKILL_TOOL_NAME);
    if (!hasSkillTool) {
      dynamicTools.push(createSkillTool(skillStore));
    }
  }

  return [...allBuiltinTools, ...dynamicTools].filter((tool) => {
    if (!isBuiltinToolName(tool.definition.name)) return false;
    if (tool.definition.name === 'read_current_document' && !hasActiveEditor) return false;
    if (tool.definition.name === READ_CURRENT_WEBPAGE_TOOL_NAME && !hasActiveWebview) return false;
    if (tool.definition.name === READ_DIRECTORY_TOOL_NAME && !hasWorkspace) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run focused checks**

Run:

```bash
pnpm test test/ai/tools/builtin-index.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS or unrelated pre-existing TypeScript errors only.

---

### Task 6: Changelog and Final Verification

**Files:**
- Modify: `changelog/2026-06-03.md`
- Verify: tests and lint commands

- [ ] **Step 1: Add changelog entry**

If `changelog/2026-06-03.md` exists, add this under `## Features`; if the section does not exist, create it:

```md
## Features
- 新增当前网页读取 AI 工具设计与实现，支持在激活 WebView 时按需读取页面快照。
```

If the file does not exist, create:

```md
# 2026-06-03

## Features
- 新增当前网页读取 AI 工具设计与实现，支持在激活 WebView 时按需读取页面快照。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/ai/tools/webview-context.test.ts test/ai/tools/builtin-webpage.test.ts test/views/webview-web-snapshot.test.ts test/ai/tools/builtin-index.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 5: Run style lint**

Run: `pnpm lint:style`

Expected: PASS.

- [ ] **Step 6: Inspect final diff**

Run: `git diff --stat`

Expected: diff includes only the WebView tool implementation, tests, changelog, spec update, and this plan. Existing unrelated changes such as `src/components/BSearchRecent/types.ts` must remain untouched unless the user explicitly includes them.

---

## Self-Review

- Spec coverage: registry activation, context injection, snapshot fields, truncation markers, timeout, concurrent read reuse, CSP/security errors, no `@page`, runtime tool filtering, and tests are covered by Tasks 1-6.
- Placeholder scan: plan contains concrete files, code snippets, commands, and expected outcomes.
- Type consistency: the plan consistently uses `read_current_webpage`, `READ_CURRENT_WEBPAGE_TOOL_NAME`, `WebviewToolContext`, and `readPageSnapshot()`.
