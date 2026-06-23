# WebView Page-Agent DOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `read_current_webpage` around a page-agent style flat DOM tree and make `operate_webpage` resolve indexes from the same collector.

**Architecture:** Introduce a shared WebView page DOM runtime that is embedded into both snapshot and operation scripts. The runtime returns a serializable flat tree for snapshots and keeps local DOM references only inside the injected page script for operations. Existing public `WebviewPageSnapshot` fields stay compatible while `content` moves toward the page-agent `[N]<tag ... />` representation.

**Tech Stack:** Vue 3, Electron `<webview>`, TypeScript, generated page JavaScript strings, Vitest with jsdom.

---

## User Constraint

Do not create intermediate code commits. Implement with TDD and verification, then make one final commit only after the whole refactor is complete.

## File Structure

- Create: `src/views/webview/web/automation/engine/types.ts`
  - Internal serializable flat DOM tree types.
- Create: `src/views/webview/web/automation/engine/runtime.ts`
  - Shared injected runtime source for DOM collection, interactive detection, fingerprinting, top-layer helpers, and operation-time DOM ref lookup.
- Create: `src/views/webview/web/automation/engine/serializer.ts`
  - Shared injected serializer source for converting the flat tree to page-agent style simplified DOM text.
- Modify: `src/views/webview/web/automation/snapshotScript.ts`
  - Replace ad hoc snapshot traversal with the shared runtime and serializer.
- Modify: `src/views/webview/web/automation/operationScript.ts`
  - Replace duplicated candidate scanning with the shared runtime.
- Modify: `src/views/webview/web/automation/types.ts`
  - Add any active snapshot identity fields needed for fingerprint validation.
- Modify: `src/views/webview/web/automation/normalize.ts`
  - Keep validation compatible with the new raw fields and continue stripping internal fields.
- Modify: `src/views/webview/web/hooks/useWebView.ts`
  - Keep orchestration behavior and adjust active snapshot identity creation only if needed.
- Modify: `test/views/webview/web-use-webview.test.ts`
  - Add RED tests and update format-specific expectations.
- Modify: `changelog/2026-06-23.md`
  - Record the refactor before the final commit.

## Task 1: Add RED Coverage For Page-Agent DOM Semantics

**Files:**
- Modify: `test/views/webview/web-use-webview.test.ts`

- [ ] **Step 1: Add a failing test for direct scroll container indexing**

Add this test near the existing webpage snapshot tests:

```typescript
  it('indexes scrollable webpage containers as direct operation targets', async (): Promise<void> => {
    document.body.innerHTML = `
      <main>
        <section id="result-list" aria-label="结果列表" style="overflow-y: auto;">
          <button>第一项</button>
        </section>
      </main>
    `;
    const main = document.querySelector('main');
    const resultList = document.querySelector('#result-list');
    const firstItem = document.querySelector('button');
    if (!(main instanceof HTMLElement) || !(resultList instanceof HTMLElement) || !(firstItem instanceof HTMLElement)) {
      throw new Error('scrollable container snapshot elements should exist');
    }

    installVisibleRect(main);
    installScrollableElementMetrics(resultList, { clientHeight: 120, scrollHeight: 900, clientWidth: 320, scrollWidth: 320 });
    installVisibleRect(firstItem);
    const controller = useWebView(ref<WebviewTag | null>(createPageScriptExecutingWebview()));

    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.elements?.find((element) => element.label === '结果列表')).toMatchObject({
      tagName: 'SECTION',
      actions: ['scroll']
    });
    expect(snapshot.content).toContain('[1]<section');
    expect(snapshot.content).toContain('data-scrollable');
  });
```

- [ ] **Step 2: Add a failing test for new element markers**

Add this test near the existing simplified DOM snapshot test:

```typescript
  it('marks newly discovered webpage elements in page-agent content', async (): Promise<void> => {
    document.body.innerHTML = '<main><button id="first">已有入口</button></main>';
    const first = document.querySelector('#first');
    if (!(first instanceof HTMLElement)) {
      throw new Error('initial new-element marker button should exist');
    }

    installVisibleRect(first);
    const controller = useWebView(ref<WebviewTag | null>(createPageScriptExecutingWebview()));

    await controller.readPageSnapshot();

    const second = document.createElement('button');
    second.id = 'second';
    second.textContent = '新增入口';
    document.querySelector('main')?.appendChild(second);
    installVisibleRect(second);

    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.elements?.find((element) => element.label === '新增入口')).toMatchObject({
      isNew: true,
      actions: ['click']
    });
    expect(snapshot.content).toContain('*[2]<button');
  });
```

- [ ] **Step 3: Add a failing test for operation using the same collector**

Add this test near operation tests:

```typescript
  it('operates elements resolved by the shared flat DOM collector', async (): Promise<void> => {
    document.body.innerHTML = `
      <main>
        <div id="delegated-card" class="service-entry" style="cursor: pointer;">
          <span>共享索引入口</span>
        </div>
      </main>
    `;
    const card = document.querySelector('#delegated-card');
    const label = document.querySelector('span');
    if (!(card instanceof HTMLElement) || !(label instanceof HTMLElement)) {
      throw new Error('shared collector operation elements should exist');
    }

    let clickCount = 0;
    card.addEventListener('click', () => {
      clickCount += 1;
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [label, card, document.body, document.documentElement])
    });
    installVisibleRect(card);
    installVisibleRect(label);
    const webviewElement = createPageScriptExecutingWebview();
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));

    const snapshot = await controller.readPageSnapshot();
    const target = snapshot.elements?.find((element) => element.label === '共享索引入口');
    if (!target) {
      throw new Error('shared collector target should exist');
    }
    const result = await controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'click', index: target.index } });

    expect(clickCount).toBe(1);
    expect(result).toMatchObject({ ok: true, action: 'click', target: { index: target.index, label: '共享索引入口', tagName: 'DIV' } });
  });
```

- [ ] **Step 4: Run the focused test file and verify RED**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: the new tests fail because scroll containers are not directly indexed without selector hints, `isNew` is always false, page-agent `*[N]` lines are not emitted, and operation still relies on the duplicated old candidate scan.

- [ ] **Step 5: Do not commit**

Run:

```bash
git status --short
```

Expected: only the test file is modified at this point.

## Task 2: Add Serializable Flat DOM Types

**Files:**
- Create: `src/views/webview/web/automation/engine/types.ts`
- Modify: `src/views/webview/web/automation/types.ts`

- [ ] **Step 1: Create `types.ts`**

Use this structure:

```typescript
/**
 * @file types.ts
 * @description WebView 页面内扁平 DOM 树的可序列化类型。
 */
import type { WebviewAgentElementAction, WebviewViewportElementLayer, WebviewViewportRect } from '@/ai/tools/context/webview';

/** 页面 DOM 节点滚动距离。 */
export interface EngineScrollData {
  /** 距离顶部可滚动像素。 */
  top: number;
  /** 距离右侧可滚动像素。 */
  right: number;
  /** 距离底部可滚动像素。 */
  bottom: number;
  /** 距离左侧可滚动像素。 */
  left: number;
}

/** 页面 DOM 节点扩展信息。 */
export interface EngineNodeExtra {
  /** 节点是否可滚动。 */
  scrollable?: boolean;
  /** 节点滚动距离。 */
  scrollData?: EngineScrollData;
}

/** 页面 DOM 文本节点。 */
export interface EngineTextNode {
  /** 节点类型。 */
  type: 'TEXT_NODE';
  /** 节点文本。 */
  text: string;
  /** 是否可见。 */
  isVisible: boolean;
}

/** 页面 DOM 元素节点。 */
export interface EngineElementNode {
  /** 节点类型。 */
  type: 'ELEMENT_NODE';
  /** 元素标签名。 */
  tagName: string;
  /** 元素属性。 */
  attributes: Record<string, string>;
  /** 子节点 ID。 */
  children: string[];
  /** 是否可见。 */
  isVisible: boolean;
  /** 是否处于命中测试顶层。 */
  isTopElement: boolean;
  /** 是否在视口内。 */
  isInViewport: boolean;
  /** 是否为可交互元素。 */
  isInteractive: boolean;
  /** 本次快照内高亮索引。 */
  highlightIndex?: number;
  /** 是否为新出现元素。 */
  isNew: boolean;
  /** 元素可读文本。 */
  text: string;
  /** 元素可读标签。 */
  label: string;
  /** 元素身份指纹。 */
  fingerprint: string;
  /** 元素角色提示。 */
  roleHint?: string;
  /** 元素支持动作。 */
  actions: WebviewAgentElementAction[];
  /** 元素相对视口矩形。 */
  rect?: WebviewViewportRect;
  /** 元素可见比例。 */
  visibleRatio?: number;
  /** 元素视觉层。 */
  layer?: WebviewViewportElementLayer;
  /** 是否被顶层浮层覆盖。 */
  covered?: boolean;
  /** 是否为顶层主操作。 */
  primary?: boolean;
  /** 可操作置信分。 */
  clickableScore?: number;
  /** 可操作原因。 */
  reasons?: string[];
  /** 语义路径。 */
  semanticPath?: string[];
  /** 扩展数据。 */
  extra?: EngineNodeExtra;
  /** 是否包含开放 shadow root。 */
  shadowRoot?: boolean;
}

/** 页面 DOM 节点。 */
export type EngineNode = EngineTextNode | EngineElementNode;

/** 页面扁平 DOM 树。 */
export interface EngineFlatTree {
  /** 根节点 ID。 */
  rootId: string;
  /** 节点表。 */
  map: Record<string, EngineNode>;
}
```

- [ ] **Step 2: Extend active snapshot identities only if needed**

If operation validation needs a tree identity beyond the current `index`, `tagName`, `label`, and `fingerprint`, add optional fields to `ActiveWebviewSnapshotElement` in `src/views/webview/web/automation/types.ts`:

```typescript
  /** 扁平 DOM 树内节点路径，便于调试快照漂移。 */
  treePath?: string;
```

- [ ] **Step 3: Run typecheck to verify no import mistakes**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: the new type file compiles, while RED behavior tests may still fail.

## Task 3: Introduce The Shared Page DOM Runtime

**Files:**
- Create: `src/views/webview/web/automation/engine/runtime.ts`

- [ ] **Step 1: Create the runtime source builder**

Create `runtime.ts` with this exported API:

```typescript
/**
 * @file runtime.ts
 * @description WebView 页面内 DOM 采集运行时代码生成器。
 */

/**
 * 构建注入页面的扁平 DOM 采集运行时代码。
 * @returns 页面运行时代码片段
 */
export function createRuntimeScript(): string {
  return `
const __tibisWebviewEngine = (() => {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const HIDDEN_TAGS = new Set(['script', 'style', 'template', 'noscript']);
  const SEMANTIC_TAGS = new Set(['main', 'nav', 'menu', 'header', 'footer', 'section', 'article', 'aside', 'form', 'label', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

  const readText = (value) => String(value || '').replace(/[\\uE000-\\uF8FF]/g, '').replace(/\\s+/g, ' ').trim();
  const readClassName = (element) => typeof element.className === 'string' ? element.className : '';
  const matchesSelector = (element, selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  };

  // Existing snapshotScript and operationScript helper bodies move here:
  // collectComposedElements, containsComposedElement, isVisible, readLabel,
  // readFingerprint, scroll detection, compact navigation detection,
  // action inference, viewport rects, hit testing, top-layer detection.

  return {
    collectFlatDomTree,
    findIndexedElement,
    readText,
    readLabel,
    readFingerprint,
    readViewportRect,
    readActions,
    readTopLayerInfo
  };
})();
`;
}
```

Replace the comment block while implementing by moving the current helper bodies from `snapshotScript.ts` and `operationScript.ts` into the runtime. Keep the function names stable so later tasks can embed and call them.

- [ ] **Step 2: Implement `collectFlatDomTree` inside the runtime**

The collector must return both serializable data and local refs:

```javascript
const collectFlatDomTree = () => {
  let nextNodeId = 0;
  let nextIndex = 1;
  const map = {};
  const refs = new Map();

  const createNodeId = () => String(nextNodeId++);
  const markSeen = (fingerprint) => {
    const globalKey = '__tibisWebviewSeenElementFingerprints';
    const seen = window[globalKey] instanceof Set ? window[globalKey] : new Set();
    window[globalKey] = seen;
    const isNew = !seen.has(fingerprint);
    seen.add(fingerprint);
    return isNew;
  };

  const visit = (node, parentIframe) => {
    if (!node || (node.nodeType !== ELEMENT_NODE && node.nodeType !== TEXT_NODE)) return null;
    if (node.nodeType === TEXT_NODE) return visitTextNode(node);
    return visitElementNode(node, parentIframe);
  };

  const rootId = document.body ? visit(document.body, null) : null;
  return { flatTree: { rootId: rootId || '0', map }, refs };
};
```

Fill in `visitTextNode` and `visitElementNode` with the migrated helper logic:

- Text nodes store `{ type: 'TEXT_NODE', text, isVisible }`.
- Element nodes store `{ type: 'ELEMENT_NODE', tagName, attributes, children, isVisible, isTopElement, isInViewport, isInteractive, isNew, text, label, fingerprint, actions }`.
- Only assign `highlightIndex` and add to `refs` when `actions.length > 0`.
- Process `node.shadowRoot` after regular child nodes and mark `shadowRoot: true`.
- Try same-origin iframe children in a `try/catch`.

- [ ] **Step 3: Run RED tests again**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: tests still fail because the runtime is not embedded yet.

## Task 4: Add The Page-Agent Serializer

**Files:**
- Create: `src/views/webview/web/automation/engine/serializer.ts`

- [ ] **Step 1: Create serializer source builder**

Create `serializer.ts` with this exported API:

```typescript
/**
 * @file serializer.ts
 * @description WebView 扁平 DOM 树简化文本序列化脚本生成器。
 */

/**
 * 构建注入页面的扁平 DOM 序列化代码。
 * @returns 页面序列化代码片段
 */
export function createSerializerScript(): string {
  return `
const __tibisWebviewEngineSerializer = (() => {
  const SEMANTIC_TAGS = new Set(['main', 'nav', 'menu', 'header', 'footer', 'section', 'article', 'aside', 'form', 'label', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const DEFAULT_INCLUDE_ATTRIBUTES = ['title', 'type', 'checked', 'name', 'role', 'value', 'placeholder', 'data-date-format', 'alt', 'aria-label', 'aria-expanded', 'data-state', 'aria-checked', 'id', 'for', 'target', 'aria-haspopup', 'aria-controls', 'aria-owns', 'contenteditable', 'class', 'data-testid', 'data-test', 'data-cy', 'data-id', 'data-action', 'data-ai-action', 'data-click', 'data-command', 'data-href'];
  const escapeText = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const capText = (value, limit) => String(value || '').length > limit ? String(value || '').slice(0, limit) + '...' : String(value || '');

  const flatTreeToString = (flatTree) => {
    const rootNode = buildTreeNode(flatTree, flatTree.rootId);
    if (!rootNode) return '<EMPTY>';
    setParents(rootNode, null);
    const lines = [];
    processNode(rootNode, 0, lines);
    return lines.length ? lines.slice(0, 260).join('\\n') : '<EMPTY>';
  };

  return { flatTreeToString };
})();
`;
}
```

- [ ] **Step 2: Implement serializer helper bodies**

Inside the source string, implement these helpers:

```javascript
const buildTreeNode = (flatTree, nodeId) => {
  const node = flatTree.map[nodeId];
  if (!node) return null;
  const children = Array.isArray(node.children) ? node.children.map((childId) => buildTreeNode(flatTree, childId)).filter(Boolean) : [];
  return { ...node, parent: null, children };
};

const setParents = (node, parent) => {
  node.parent = parent;
  node.children.forEach((child) => setParents(child, node));
};

const hasIndexedParent = (node) => {
  let current = node.parent;
  while (current) {
    if (typeof current.highlightIndex === 'number') return true;
    current = current.parent;
  }
  return false;
};
```

Then implement `processNode` with these rules:

- For indexed elements, emit `*[N]` when `isNew` is true and `[N]` otherwise.
- Attribute values use `DEFAULT_INCLUDE_ATTRIBUTES`, dedupe duplicate long values, remove `role` when it equals the tag name, and cap values at 40 characters.
- Text comes from the node text until the next indexed child.
- Scrollable nodes append `data-scrollable="top=..., bottom=..."`.
- Text nodes are emitted only when visible, top-level enough, and not already covered by an indexed parent.
- Semantic non-indexed containers emit opening and closing tags only when they contain emitted children.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: new modules compile.

## Task 5: Migrate Snapshot Script To The Flat Tree Pipeline

**Files:**
- Modify: `src/views/webview/web/automation/snapshotScript.ts`
- Modify: `src/views/webview/web/automation/normalize.ts` if validation needs to accept new optional fields

- [ ] **Step 1: Import runtime and serializer builders**

At the top of `snapshotScript.ts`, add:

```typescript
import { createRuntimeScript } from './engine/runtime';
import { createSerializerScript } from './engine/serializer';
```

- [ ] **Step 2: Replace the script body orchestration**

Keep `createPageSnapshotScript()` as the public function, but make the returned script start with the shared runtime:

```typescript
export function createPageSnapshotScript(): string {
  return `
(() => {
  ${createRuntimeScript()}
  ${createSerializerScript()}

  const { flatTree } = __tibisWebviewEngine.collectFlatDomTree();
  const indexedNodes = __tibisWebviewEngine.readIndexedNodes(flatTree);
  const content = __tibisWebviewEngineSerializer.flatTreeToString(flatTree);

  // Assemble scroll, header, footer, text, selectedText, headings, links,
  // viewport, elements, and return the raw WebviewPageSnapshot object.
})();
`;
}
```

During implementation, replace the assembly comment with migrated code from current `snapshotScript.ts`. The important change is that `elements` must be derived from `indexedNodes`, not from a separate `elementEntries` scan.

- [ ] **Step 3: Preserve public element metadata**

Each indexed node should map to the existing public shape:

```javascript
const elements = indexedNodes.slice(0, WEBVIEW_PAGE_ELEMENT_LIMIT).map((node) => ({
  index: node.highlightIndex,
  tagName: node.tagName.toUpperCase(),
  role: node.attributes.role || undefined,
  text: node.text,
  label: node.label,
  roleHint: node.roleHint,
  fingerprint: node.fingerprint,
  placeholder: node.attributes.placeholder || undefined,
  href: node.href,
  valuePreview: node.valuePreview,
  disabled: node.disabled,
  checked: node.checked,
  selected: node.selected,
  isNew: node.isNew,
  rect: node.rect,
  visibleRatio: node.visibleRatio,
  covered: node.covered,
  layer: node.layer,
  primary: node.primary,
  clickableScore: node.clickableScore,
  reasons: node.reasons,
  semanticPath: node.semanticPath,
  hitTarget: node.hitTarget,
  actions: node.actions
}));
```

- [ ] **Step 4: Update format-specific test expectations**

Update assertions that expect old paired tags when the new serializer intentionally emits page-agent style self-closing lines. For example:

```typescript
expect(snapshot.content).toContain('[2]<button type=submit aria-label=筛选>筛选 />');
```

Keep assertions that verify semantic content, shadow DOM, element actions, top layer, and selected element matching.

- [ ] **Step 5: Run focused tests and verify progress**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: snapshot-focused tests for scroll containers and new elements pass. Operation-focused tests may still fail until Task 6.

## Task 6: Migrate Operation Script To The Shared Collector

**Files:**
- Modify: `src/views/webview/web/automation/operationScript.ts`

- [ ] **Step 1: Import the runtime builder**

At the top of `operationScript.ts`, add:

```typescript
import { createRuntimeScript } from './engine/runtime';
```

- [ ] **Step 2: Replace duplicated candidate scanning**

Inside `createPageOperationScript`, embed the runtime and resolve targets through flat tree refs:

```typescript
return `
(async () => {
  const input = ${serializedInput};
  const snapshotElements = ${serializedSnapshotElements};
  ${createRuntimeScript()}

  const { flatTree, refs } = __tibisWebviewEngine.collectFlatDomTree();
  const indexedNodes = __tibisWebviewEngine.readIndexedNodes(flatTree);
  const findElement = (index) => refs.get(index) || null;
  const findNode = (index) => indexedNodes.find((node) => node.highlightIndex === index) || null;

  // Keep wait, scroll without index, click, input, select, press, and scroll actions.
})();
`;
```

- [ ] **Step 3: Validate fingerprints against flat tree nodes**

Use the node fingerprint instead of recomputing through a separate helper:

```javascript
const assertElementMatchesSnapshot = (node, index) => {
  const expected = snapshotElements.find((item) => item && item.index === index) || null;
  if (!expected || typeof expected.fingerprint !== 'string' || !expected.fingerprint) return;
  if (!node || node.fingerprint !== expected.fingerprint) throw new Error('STALE_SNAPSHOT');
};
```

- [ ] **Step 4: Preserve action behavior**

Move existing action execution bodies unchanged where possible:

- `wait` still waits up to 5 seconds.
- window scroll without an index still works.
- click still uses hit-tested deepest child inside the indexed element.
- input still uses native value setters and dispatches `input`/`change`.
- select still handles ambiguous option text.
- press still dispatches `keydown`, `keypress` for Enter, and `keyup`.
- indexed scroll first scrolls the indexed element if it can move in that direction, then an ancestor, then reports no movement if neither can move.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: read and operation tests pass, including the new shared collector operation test and existing stale fingerprint tests.

## Task 7: Normalize, Active Snapshot, And Tool Summary Compatibility

**Files:**
- Modify: `src/views/webview/web/automation/normalize.ts`
- Modify: `src/views/webview/web/hooks/useWebView.ts`
- Modify: `src/components/BChat/tool-result-summary.test.ts` only if summary expectations need format updates

- [ ] **Step 1: Keep raw snapshot validation compatible**

If the new raw `elements` contain optional fields not currently validated, adjust guards narrowly. Preserve the existing allowed actions filter:

```typescript
actions: element.actions.filter((action) => action === 'click' || action === 'input' || action === 'select' || action === 'press' || action === 'scroll')
```

- [ ] **Step 2: Preserve public fingerprint stripping**

Confirm `createPublicWebviewPageSnapshot` still deletes fingerprints:

```typescript
const elements = snapshot.elements?.map((element) => {
  const publicElement: WebviewAgentElement = { ...element };
  delete publicElement.fingerprint;
  return publicElement;
});
```

- [ ] **Step 3: Keep active snapshot identities private**

If new tree identity fields were added, include them in `createActiveSnapshotElements` and never expose them through public `elements`.

- [ ] **Step 4: Run tool summary tests**

Run:

```bash
pnpm test test/components/BChat/tool-result-summary.test.ts
```

Expected: summaries still describe `read_current_webpage` with simplified DOM metadata.

## Task 8: Changelog And Full Verification

**Files:**
- Modify: `changelog/2026-06-23.md`

- [ ] **Step 1: Add changelog entry**

If the file does not exist, create it. Add:

```markdown
## Changed
- 重构 WebView `read_current_webpage` 页面读取链路，改为共享扁平 DOM 树采集、page-agent 风格简化 DOM 输出，并让 `operate_webpage` 复用同一套元素索引规则。
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
pnpm test test/components/BChat/tool-result-summary.test.ts
```

Expected: both pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: pass.

- [ ] **Step 4: Run lint check without auto-fix first**

Run:

```bash
pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx
```

Expected: pass. If formatting/import-order issues appear, fix them manually or run `pnpm lint` only after reviewing the changed files.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only planned files are changed.

- [ ] **Step 6: Final commit only after user-visible completion**

After all verification passes and the user is ready for a final commit, stage and commit all related files together:

```bash
git add src/views/webview/web/automation/engine/types.ts src/views/webview/web/automation/engine/runtime.ts src/views/webview/web/automation/engine/serializer.ts src/views/webview/web/automation/snapshotScript.ts src/views/webview/web/automation/operationScript.ts src/views/webview/web/automation/types.ts src/views/webview/web/automation/normalize.ts src/views/webview/web/hooks/useWebView.ts test/views/webview/web-use-webview.test.ts test/components/BChat/tool-result-summary.test.ts changelog/2026-06-23.md
git commit -m "refactor: 重构 WebView 页面 DOM 读取链路"
```

Do not run this step until implementation and verification are complete.

## Self-Review

- Spec coverage: the plan covers shared flat tree collection, page-agent content serialization, read/operate shared indexing, top-layer behavior, scroll targets, shadow DOM, new markers, public compatibility, tests, and changelog.
- Placeholder scan: no task contains incomplete markers or an unspecified "add tests later" step.
- Type consistency: file names and exported functions are consistent across tasks: `createRuntimeScript`, `createSerializerScript`, `collectFlatDomTree`, and `readIndexedNodes`.
