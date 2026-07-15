# AI Resource Lazy Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eager Skill and Widget content scanning with directory-only discovery and Store-owned first-use content caching shared by settings, chat, detail, and editor consumers.

**Architecture:** Skill and Widget scanners return lightweight directory indices. Each Pinia Store wraps an index and optional raw/parsed content in a single Entry, uses a generic keyed `SharedRequest` Class to coalesce concurrent first loads, and explicitly updates cached content after application-owned saves. Resource directory watchers only add and remove indices; loaded content remains stable until an explicit in-app update or application restart.

**Tech Stack:** Vue 3, Pinia, TypeScript strict mode, Electron IPC, Chokidar, Vitest, Vue Test Utils

## Follow-up: Store Getter API and Error Boundary

### Task 10: Rename Store content getters and absorb read failures

**Files:**
- Modify: `src/stores/ai/skill.ts`
- Modify: `src/stores/ai/widget.ts`
- Modify: `test/stores/ai/skill.test.ts`
- Modify: `test/stores/ai/widget.test.ts`

**Interfaces:**
- Produces: `getSkill(id: string): Promise<SkillEntry | undefined>` and `getSkills(): Promise<SkillEntry[]>`.
- Produces: `getWidget(id: string): Promise<WidgetEntry | undefined>` and `getWidgets(): Promise<WidgetEntry[]>`.
- Guarantees: read failures set `loadError` and resolve the current Entry; missing IDs resolve `undefined`; consumers do not receive entry-read rejections.

- [ ] Add failing tests for the new names, missing-ID `undefined`, read-error Entry results, retry, and concurrent sharing.
- [ ] Run `pnpm exec vitest run test/stores/ai/skill.test.ts test/stores/ai/widget.test.ts` and verify RED because the getter APIs do not exist.
- [ ] Implement the getter boundary with `asyncTo(sharedRequest.fetch(id))`, retaining Store-owned retry and revision behavior.
- [ ] Run the focused Store tests and verify GREEN.

### Task 11: Simplify all Store consumers

**Files:**
- Modify: `src/views/settings/tools/skill/index.vue`
- Modify: `src/views/settings/tools/skill/detail.vue`
- Modify: `src/views/settings/tools/widget/index.vue`
- Modify: `src/views/widget/hooks/useSession.ts`
- Modify: `src/components/BChat/hooks/useRuntimeTools.ts`
- Modify: `src/ai/tools/builtin/SkillTool/index.ts`
- Modify: `src/ai/tools/builtin/WidgetTool/index.ts`
- Modify: corresponding tests under `test/views`, `test/components/BChat`, and `test/ai/tools`.

**Interfaces:**
- Consumes: the getter APIs from Task 10.
- Produces: consumers without entry-read `try/catch` or `PromiseSettledResult.status` branching.

- [ ] Rename test doubles and expectations to the new getter API and assert business layers consume returned Entry state.
- [ ] Run the focused consumer tests and verify RED on old method names and old error behavior.
- [ ] Rename production call sites and remove redundant read-error handling.
- [ ] Run the focused consumer tests and verify GREEN.

### Task 12: Remove the superseded Skill file-change channel

**Files:**
- Modify: `electron/main/modules/workspace/watch.mts`
- Modify: `electron/main/modules/workspace/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`
- Modify: `src/shared/platform/native/types.ts`
- Modify: `src/shared/platform/native/electron.ts`
- Modify: affected platform mocks under `test/`.

**Interfaces:**
- Removes: `onSkillChanged`, `skill:changed`, `watchDirectory`, and `unwatchDirectory`.
- Retains: `watchResourceDirectory`, `unwatchResourceDirectory`, and `onDirectoryChanged`.

- [ ] Add or update contract tests so the legacy API is absent and resource-directory APIs remain available.
- [ ] Run watcher, lifecycle, and affected chat tests and verify RED against the old contracts.
- [ ] Remove renderer, preload, IPC, and main-process legacy implementations plus unused file-reading watcher logic.
- [ ] Run focused tests, ESLint, Stylelint, TypeScript, build, and `git diff --check`.

## Global Constraints

- Do not use `any`; use concrete types or `unknown`.
- Every new or modified function, class, interface, and complex logic block must have accurate JSDoc or intent comments.
- Function names must contain at most four words.
- B-prefixed components remain globally auto-imported unless an explicit type or dynamic import is required.
- Prefer `lodash-es` over handwritten collection helpers when it provides the required behavior; keyed in-flight Promise sharing is not a lodash memoization use case because settled requests must be cleared.
- Documentation paths must remain repository-relative and must not contain machine-specific absolute paths.
- Do not run `git add` or `git commit`; the user will review and commit all final changes together.
- Add the implementation summary to `changelog/2026-07-15.md` before final verification.

---

## File Structure

### New files

- `src/utils/sharedRequest.ts` — generic keyed in-flight Promise sharing Class.
- `test/utils/shared-request.test.ts` — concurrency, cleanup, and retry tests for `SharedRequest`.
- `test/views/settings/tools/skill/index.test.ts` — Skill list lazy-load integration tests.
- `test/views/settings/tools/skill/detail.test.ts` — Skill detail Store-cache integration tests.

### Resource model and discovery

- `src/ai/skill/types.ts` — `SkillIndex`, `SkillEntry`, and parsed definition types.
- `src/ai/widget/types.ts` — `WidgetIndex`, `WidgetEntry`, and parsed definition types.
- `src/ai/skill/parser.ts` — parsed Skill definitions no longer own enablement.
- `src/ai/widget/parser.ts` — parsed Widget definitions no longer own enablement.
- `src/ai/skill/scanner.ts` — recover installs, then return directory indices without reading `SKILL.md`.
- `src/ai/widget/scanner.ts` — recover installs, then return directory indices without reading `widget.json`.
- `src/ai/skill/index.ts` and `src/ai/widget/index.ts` — export the new types and scanner names.
- `test/ai/skill/parser.test.ts`, `test/ai/widget/parser.test.ts`, `test/ai/skill/scanner.test.ts`, `test/ai/widget/scanner.test.ts` — model and directory discovery coverage.

### Store and lifecycle

- `src/stores/ai/skill.ts` — Skill directory index, lazy content cache, fetch APIs, revision protection, and disabled-ID migration.
- `src/stores/ai/widget.ts` — Widget directory index, lazy content cache, fetch APIs, and revision protection.
- `test/stores/ai/skill.test.ts`, `test/stores/ai/widget.test.ts` — first-load, cache, retry, save, and race tests.
- `electron/main/modules/workspace/watch.mts` — resource-directory add/remove events and initial file-watch suppression.
- `electron/main/modules/workspace/ipc.mts` — resource-directory watch IPC handlers.
- `electron/preload/index.mts`, `types/electron-api.d.ts` — directory event bridge.
- `src/shared/platform/native/types.ts`, `src/shared/platform/native/electron.ts` — renderer Native contract.
- `src/layouts/default/hooks/useSkillInit.ts`, `src/layouts/default/hooks/useWidgetInit.ts` — directory-only lifecycle orchestration.
- `test/electron/main/modules/workspace/watch.test.ts`, `test/layouts/default/ai-resource-init.test.ts` — watcher and lifecycle tests.

### Consumers and cache updates

- `src/views/settings/tools/skill/index.vue`, `src/views/settings/tools/skill/detail.vue`, `src/views/settings/tools/skill/components/SkillItemRow.vue`, `src/views/settings/tools/skill/components/SkillPreview.vue`, `src/views/settings/tools/skill/components/SkillCreator.vue` — Entry-based list/detail/create/delete flows.
- `src/views/settings/tools/widget/index.vue`, `src/views/settings/tools/widget/components/WidgetItemRow.vue`, `src/views/settings/tools/widget/components/WidgetCreator.vue` — Entry-based list/create/delete flows.
- `src/router/routes/modules/settings.ts` — Skill detail route uses directory ID.
- `src/ai/tools/builtin/SkillTool/index.ts`, `src/ai/tools/builtin/WidgetTool/index.ts`, `src/ai/tools/builtin/index.ts` — tool contracts consume loaded Entries.
- `src/components/BChat/hooks/useRuntimeTools.ts`, `src/components/BChat/hooks/useRuntimeRequestConfig.ts`, `src/components/BChat/index.vue` — fetch all resources before tool snapshot construction.
- `test/ai/tools/builtin-skill-tool.test.ts`, `test/ai/tools/builtin-widget-tool.test.ts`, `test/components/BChat/use-runtime-tools.test.ts`, `test/components/BChat/session-id-runtime.test.ts` — chat and tool cache behavior.
- `src/views/widget/hooks/useSession.ts`, `test/views/widget/use-session.test.ts` — Widget editor reads and updates Store content while preserving drafts.
- `src/stores/helpers/events.ts`, `src/views/editor/hooks/useSession.ts`, `test/views/editor/use-session-save-dialog.test.ts` — generic saved-file event updates loaded Skill content without coupling the editor to the Skill Store.

---

### Task 1: Generic keyed shared request Class

**Files:**
- Create: `src/utils/sharedRequest.ts`
- Create: `test/utils/shared-request.test.ts`

**Interfaces:**
- Produces: `new SharedRequest<Key, Result>(handler)` and `fetch(key: Key): Promise<Result>`.
- Guarantees: only in-flight calls are shared; settled results are removed; sync throws become rejected Promises.

- [ ] **Step 1: Write failing shared-request tests**

```ts
/**
 * @file shared-request.test.ts
 * @description 按键共享异步请求测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { SharedRequest } from '@/utils/sharedRequest';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  let rejectPromise: (reason: unknown) => void = (): void => undefined;
  const promise = new Promise<T>((resolve, reject): void => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe('SharedRequest', (): void => {
  it('shares concurrent requests with the same key and separates different keys', async (): Promise<void> => {
    const weather = createDeferred<string>();
    const travel = createDeferred<string>();
    const handler = vi.fn((key: string): Promise<string> => (key === 'weather' ? weather.promise : travel.promise));
    const requests = new SharedRequest<string, string>(handler);

    const first = requests.fetch('weather');
    const second = requests.fetch('weather');
    const third = requests.fetch('travel');
    await Promise.resolve();

    expect(first).toBe(second);
    expect(handler).toHaveBeenCalledTimes(2);
    weather.resolve('sunny');
    travel.resolve('train');
    await expect(first).resolves.toBe('sunny');
    await expect(third).resolves.toBe('train');
  });

  it('clears settled requests so failures and successes can run again', async (): Promise<void> => {
    const handler = vi.fn<(_key: string) => Promise<string>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ready');
    const requests = new SharedRequest<string, string>(handler);

    await expect(requests.fetch('weather')).rejects.toThrow('offline');
    await expect(requests.fetch('weather')).resolves.toBe('ready');
    await expect(requests.fetch('weather')).resolves.toBe('ready');
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('converts a synchronous handler throw into a rejected Promise', async (): Promise<void> => {
    const requests = new SharedRequest<string, string>(() => {
      throw new Error('sync failure');
    });

    await expect(requests.fetch('weather')).rejects.toThrow('sync failure');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run test/utils/shared-request.test.ts`

Expected: FAIL because `@/utils/sharedRequest` does not exist.

- [ ] **Step 3: Implement `SharedRequest`**

```ts
/**
 * @file sharedRequest.ts
 * @description 提供按键共享执行中异步请求的通用 Class。
 */

/**
 * 按资源键共享正在执行的异步请求。
 */
export class SharedRequest<Key, Result> {
  /** 正在执行的请求。 */
  private readonly pendingRequests = new Map<Key, Promise<Result>>();

  /**
   * 创建共享请求实例。
   * @param handler - 实际异步请求处理函数
   */
  public constructor(private readonly handler: (key: Key) => Promise<Result>) {}

  /**
   * 执行请求，相同 Key 的并发调用共享同一个 Promise。
   * @param key - 请求资源键
   * @returns 请求结果
   */
  public fetch(key: Key): Promise<Result> {
    const pending = this.pendingRequests.get(key);
    if (pending) return pending;

    const current = Promise.resolve()
      .then((): Promise<Result> => this.handler(key))
      .finally((): void => {
        if (this.pendingRequests.get(key) === current) {
          this.pendingRequests.delete(key);
        }
      });

    this.pendingRequests.set(key, current);
    return current;
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm exec vitest run test/utils/shared-request.test.ts`

Expected: PASS with 3 tests.

---

### Task 2: Directory index types and content-free scanners

**Files:**
- Modify: `src/ai/skill/types.ts`
- Modify: `src/ai/widget/types.ts`
- Modify: `src/ai/skill/parser.ts`
- Modify: `src/ai/widget/parser.ts`
- Modify: `src/ai/skill/scanner.ts`
- Modify: `src/ai/widget/scanner.ts`
- Modify: `src/ai/skill/index.ts`
- Modify: `src/ai/widget/index.ts`
- Modify: `test/ai/skill/parser.test.ts`
- Modify: `test/ai/widget/parser.test.ts`
- Modify: `test/ai/skill/scanner.test.ts`
- Modify: `test/ai/widget/scanner.test.ts`

**Interfaces:**
- Produces: `SkillIndex`, `SkillEntry`, `WidgetIndex`, `WidgetEntry`.
- Produces: `scanSkillDirectories(config, api): Promise<SkillIndex[]>`.
- Produces: `scanWidgetDirectories(config, api): Promise<WidgetIndex[]>`.
- Constraint: install recovery may read `.install-*.json`; scanners must never read resource entry files.

- [ ] **Step 1: Add failing scanner assertions for lightweight indices**

Add cases that configure one normal directory and one hidden directory, then assert:

```ts
const skills = await scanSkillDirectories({ homeDir: '/Users/test' }, api);

expect(skills).toEqual([
  {
    id: 'weather',
    source: 'global',
    dirPath: '/Users/test/.agents/skills/weather',
    filePath: '/Users/test/.agents/skills/weather/SKILL.md'
  }
]);
expect(api.readFile).not.toHaveBeenCalledWith('/Users/test/.agents/skills/weather/SKILL.md');
```

```ts
const widgets = await scanWidgetDirectories({ homeDir: '/Users/test' }, api);

expect(widgets).toEqual([
  {
    id: 'weather',
    dirPath: '/Users/test/.tibis/widgets/weather',
    filePath: '/Users/test/.tibis/widgets/weather/widget.json'
  }
]);
expect(api.readFile).not.toHaveBeenCalledWith('/Users/test/.tibis/widgets/weather/widget.json');
```

Keep the existing interrupted-install recovery cases and assert their transaction record reads still occur.

- [ ] **Step 2: Run parser and scanner tests to verify RED**

Run: `pnpm exec vitest run test/ai/skill/parser.test.ts test/ai/widget/parser.test.ts test/ai/skill/scanner.test.ts test/ai/widget/scanner.test.ts`

Expected: FAIL because the directory scanner functions and Entry types do not exist and current scanners read entry files.

- [ ] **Step 3: Add index and Entry types**

Add these structures while keeping every field documented:

```ts
export interface SkillIndex {
  id: string;
  dirPath: string;
  filePath: string;
  source: SkillSource;
}

export interface SkillEntry extends SkillIndex {
  enabled: boolean;
  revision: number;
  sourceContent?: string;
  definition?: SkillDefinition;
  loadError?: string;
}
```

```ts
export interface WidgetIndex {
  id: string;
  dirPath: string;
  filePath: string;
}

export interface WidgetEntry extends WidgetIndex {
  enabled: boolean;
  revision: number;
  sourceContent?: string;
  definition?: WidgetDefinition;
  loadError?: string;
}
```

Remove `enabled` from `SkillDefinition` and `WidgetDefinition`; parser results describe content, while Entry owns user enablement. Remove `enabled: true` from every parser success and error branch and update parser expectations accordingly.

Add parser assertions that make the ownership boundary explicit:

```ts
expect(parseSkillMarkdown(markdown, filePath)).not.toHaveProperty('enabled');
expect(parseWidgetJson(source, filePath)).not.toHaveProperty('enabled');
```

- [ ] **Step 4: Replace eager scanners with directory scanners**

After install recovery, map direct non-hidden directory entries without calling `readFile()` for their entry files:

```ts
return entries
  .filter((entry): boolean => entry.type === 'directory' && !entry.name.startsWith('.'))
  .map((entry): SkillIndex => {
    const dirPath = joinPath(globalSkillsDir, entry.name);
    return {
      id: entry.name,
      source: 'global',
      dirPath,
      filePath: joinPath(dirPath, 'SKILL.md')
    };
  });
```

```ts
return entries
  .filter((entry): boolean => entry.type === 'directory' && !entry.name.startsWith('.'))
  .map((entry): WidgetIndex => {
    const dirPath = joinPath(widgetDir, entry.name);
    return {
      id: entry.name,
      dirPath,
      filePath: joinPath(dirPath, 'widget.json')
    };
  });
```

Export the renamed functions and new types from each `index.ts`.

- [ ] **Step 5: Run parser and scanner tests and verify GREEN**

Run: `pnpm exec vitest run test/ai/skill/parser.test.ts test/ai/widget/parser.test.ts test/ai/skill/scanner.test.ts test/ai/widget/scanner.test.ts`

Expected: PASS; transaction recovery still works and no entry content is read during discovery.

---

### Task 3: Skill Store first-use cache

**Files:**
- Modify: `src/stores/ai/skill.ts`
- Modify: `test/stores/ai/skill.test.ts`

**Interfaces:**
- Consumes: `SkillEntry`, `scanSkillDirectories`, `SharedRequest`.
- Produces: `fetchSkill(id)`, `fetchAllSkills()`, `updateSkillContent(id, sourceContent)`, `handleSkillDirectory(type, dirPath)`, `refreshSkills()`.
- Produces getters: `getSkillById(id)`, `getSkillByName(name)`, `getEnabledSkills()` returning Entries.

- [ ] **Step 1: Replace eager-store tests with lazy-cache tests**

Cover the following exact behavior:

```ts
await store.init('/Users/test', api);
expect(store.skills[0]?.sourceContent).toBeUndefined();
expect(api.readFile).not.toHaveBeenCalledWith(SKILL_FILE_PATH);

const first = await store.fetchSkill('weather');
const second = await store.fetchSkill('weather');
expect(first.sourceContent).toContain('instructions');
expect(second).toBe(first);
expect(api.readFile).toHaveBeenCalledTimes(1);
```

Add a deferred-read case that calls `fetchSkill('weather')` twice before resolution and asserts one `readFile`. Add a rejection followed by success and assert the second call retries. Add a parse-error case and assert the raw source remains cached. Add a save-during-load case:

```ts
const loading = store.fetchSkill('weather');
store.updateSkillContent('weather', createSkillMarkdown('saved instructions'));
staleRead.resolve({ content: createSkillMarkdown('stale instructions') });
await loading;
expect(store.getSkillById('weather')?.definition?.content).toBe('saved instructions');
```

- [ ] **Step 2: Run the Skill Store test and verify RED**

Run: `pnpm exec vitest run test/stores/ai/skill.test.ts`

Expected: FAIL because the Store still eagerly scans definitions and has no `fetchSkill` API.

- [ ] **Step 3: Implement Skill Entry initialization and fetch**

Create Entries from indices while preserving existing Entries by ID during a directory refresh:

```ts
function createSkillEntry(index: SkillIndex): SkillEntry {
  return {
    ...index,
    enabled: !loadDisabledIds().includes(index.id),
    revision: 0
  };
}
```

Use a shared request instance:

```ts
const skillRequest = new SharedRequest<string, SkillEntry>(loadSkill);

async function fetchSkill(id: string): Promise<SkillEntry> {
  const entry = getSkillById(id);
  if (!entry) throw new Error(`Skill '${id}' not found`);
  if (entry.sourceContent !== undefined) return entry;
  return skillRequest.fetch(id);
}
```

The private loader must capture Entry identity and revision, read `entry.filePath`, parse it, and only write when both still match:

```ts
async function loadSkill(id: string): Promise<SkillEntry> {
  const entry = getSkillById(id);
  if (!entry || !cachedApi) throw new Error(`Skill '${id}' is unavailable`);
  const revision = entry.revision;

  try {
    const { content } = await cachedApi.readFile(entry.filePath);
    const current = getSkillById(id);
    if (!current) throw new Error(`Skill '${id}' was removed`);
    if (current !== entry || current.revision !== revision) return current;
    current.sourceContent = content;
    current.definition = parseSkillMarkdown(content, current.filePath, { source: current.source });
    current.loadError = undefined;
    migrateDisabledName(current);
    return current;
  } catch (error: unknown) {
    const current = getSkillById(id);
    if (!current) throw error;
    if (current !== entry || current.revision !== revision) return current;
    current.loadError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
```

Migrate the legacy disabled-name preference after parsing:

```ts
function migrateDisabledName(entry: SkillEntry): void {
  const name = entry.definition?.name;
  if (!name || !legacyDisabledNames.includes(name)) return;
  entry.enabled = false;
  persistDisabledIds();
}
```

- [ ] **Step 4: Implement bulk fetch, content updates, and directory changes**

```ts
function fetchAllSkills(): Promise<PromiseSettledResult<SkillEntry>[]> {
  return Promise.allSettled(skills.value.map((entry): Promise<SkillEntry> => fetchSkill(entry.id)));
}

function updateSkillContent(id: string, sourceContent: string): SkillEntry {
  const entry = getSkillById(id);
  if (!entry) throw new Error(`Skill '${id}' not found`);
  entry.revision += 1;
  entry.sourceContent = sourceContent;
  entry.definition = parseSkillMarkdown(sourceContent, entry.filePath, { source: entry.source });
  entry.loadError = undefined;
  return entry;
}
```

`handleSkillDirectory('add', dirPath)` derives the direct-child ID and adds an unloaded Entry. `unlink` increments the old revision before removing it. `refreshSkills()` re-runs only `scanSkillDirectories()` and merges by directory ID without clearing loaded content for unchanged directories.

Change disabled persistence to `skill.disabledIds`; read the legacy `skill.disabledNames` list during migration and write the matching directory ID once its definition has loaded.

- [ ] **Step 5: Run Skill Store tests and verify GREEN**

Run: `pnpm exec vitest run test/stores/ai/skill.test.ts`

Expected: PASS for discovery, first fetch, cached fetch, shared concurrency, retry, parse error, update, removal, and disabled-ID migration.

---

### Task 4: Widget Store first-use cache

**Files:**
- Modify: `src/stores/ai/widget.ts`
- Modify: `test/stores/ai/widget.test.ts`

**Interfaces:**
- Consumes: `WidgetEntry`, `scanWidgetDirectories`, `SharedRequest`.
- Produces: `fetchWidget(id)`, `fetchAllWidgets()`, `updateWidgetContent(id, sourceContent)`, `handleWidgetDirectory(type, dirPath)`, `refreshWidgets()`.
- Produces getters: `getWidgetById(id)` and `getEnabledWidgets()` returning Entries.

- [ ] **Step 1: Write failing Widget lazy-cache tests**

Mirror the Skill cache semantics with Widget JSON:

```ts
await store.init('/Users/test', api);
expect(store.widgets[0]?.sourceContent).toBeUndefined();

const first = await store.fetchWidget('weather');
const second = await store.fetchWidget('weather');
expect(first.definition?.description).toBe('天气描述');
expect(second).toBe(first);
expect(api.readFile).toHaveBeenCalledTimes(1);
```

Add the following cache and update assertions:

```ts
const firstPending = store.fetchWidget('weather');
const secondPending = store.fetchWidget('weather');
await Promise.resolve();
expect(firstPending).toBe(secondPending);
expect(api.readFile).toHaveBeenCalledTimes(1);
```

```ts
api.readFile.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ content: validWidgetJson });
await expect(store.fetchWidget('weather')).rejects.toThrow('offline');
await expect(store.fetchWidget('weather')).resolves.toMatchObject({ sourceContent: validWidgetJson });
expect(api.readFile).toHaveBeenCalledTimes(2);
```

```ts
api.readFile.mockResolvedValue({ content: '{broken' });
const invalid = await store.fetchWidget('weather');
expect(invalid.sourceContent).toBe('{broken');
expect(invalid.definition?.parseError).toBeTruthy();
await store.fetchWidget('weather');
expect(api.readFile).toHaveBeenCalledTimes(1);
```

```ts
store.updateWidgetContent('weather', updatedWidgetJson);
expect(store.getWidgetById('weather')?.sourceContent).toBe(updatedWidgetJson);
expect(store.getWidgetById('weather')?.definition?.description).toBe('更新后的描述');
```

- [ ] **Step 2: Run Widget Store tests and verify RED**

Run: `pnpm exec vitest run test/stores/ai/widget.test.ts`

Expected: FAIL because current initialization eagerly parses Widget definitions.

- [ ] **Step 3: Implement Widget lazy fetch and updates**

Use the same cache invariant without extracting a generic domain Store:

```ts
const widgetRequest = new SharedRequest<string, WidgetEntry>(loadWidget);

async function fetchWidget(id: string): Promise<WidgetEntry> {
  const entry = getWidgetById(id);
  if (!entry) throw new Error(`Widget '${id}' not found`);
  if (entry.sourceContent !== undefined) return entry;
  return widgetRequest.fetch(id);
}

function updateWidgetContent(id: string, sourceContent: string): WidgetEntry {
  const entry = getWidgetById(id);
  if (!entry) throw new Error(`Widget '${id}' not found`);
  entry.revision += 1;
  entry.sourceContent = sourceContent;
  entry.definition = parseWidgetJson(sourceContent, entry.filePath);
  entry.loadError = undefined;
  return entry;
}
```

Implement the private loader with explicit Entry identity and revision checks:

```ts
async function loadWidget(id: string): Promise<WidgetEntry> {
  const entry = getWidgetById(id);
  if (!entry || !cachedApi) throw new Error(`Widget '${id}' is unavailable`);
  const revision = entry.revision;

  try {
    const { content } = await cachedApi.readFile(entry.filePath);
    const current = getWidgetById(id);
    if (!current) throw new Error(`Widget '${id}' was removed`);
    if (current !== entry || current.revision !== revision) return current;
    current.sourceContent = content;
    current.definition = parseWidgetJson(content, current.filePath);
    current.loadError = undefined;
    return current;
  } catch (error: unknown) {
    const current = getWidgetById(id);
    if (!current) throw error;
    if (current !== entry || current.revision !== revision) return current;
    current.loadError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function fetchAllWidgets(): Promise<PromiseSettledResult<WidgetEntry>[]> {
  return Promise.allSettled(widgets.value.map((entry): Promise<WidgetEntry> => fetchWidget(entry.id)));
}
```

`refreshWidgets()` merges directory indices by ID and retains `sourceContent`, `definition`, `enabled`, and `revision` for unchanged entries. Before removing a missing Entry, increment its revision so a pending loader cannot write back.

- [ ] **Step 4: Run Widget Store tests and verify GREEN**

Run: `pnpm exec vitest run test/stores/ai/widget.test.ts`

Expected: PASS for all lazy cache and update scenarios.

---

### Task 5: Resource-directory watcher bridge and initialization hooks

**Files:**
- Modify: `electron/main/modules/workspace/watch.mts`
- Modify: `electron/main/modules/workspace/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`
- Modify: `src/shared/platform/native/types.ts`
- Modify: `src/shared/platform/native/electron.ts`
- Modify: `src/layouts/default/hooks/useSkillInit.ts`
- Modify: `src/layouts/default/hooks/useWidgetInit.ts`
- Modify: `test/electron/main/modules/workspace/watch.test.ts`
- Modify: `test/layouts/default/ai-resource-init.test.ts`

**Interfaces:**
- Produces: `DirectoryChangeEvent` with `type: 'add' | 'unlink'`, `rootPath`, and `dirPath`.
- Produces Native methods: `watchResourceDirectory`, `unwatchResourceDirectory`, `onDirectoryChanged`.
- Consumes Store handlers from Tasks 3 and 4.

- [ ] **Step 1: Add failing watcher and Hook tests**

Add pure matching tests:

```ts
expect(isResourceDirectory('/Users/test/.agents/skills/weather', '/Users/test/.agents/skills')).toBe(true);
expect(isResourceDirectory('/Users/test/.agents/skills/.draft', '/Users/test/.agents/skills')).toBe(false);
expect(isResourceDirectory('/Users/test/.agents/skills/group/weather', '/Users/test/.agents/skills')).toBe(false);
```

Update the Hook harness mocks to expose `onDirectoryChanged`, `watchResourceDirectory`, and `unwatchResourceDirectory`. Assert setup order is `prepare → listener → watch → directory scan`. Emit an add event and an unlink event and assert only `handleSkillDirectory` or `handleWidgetDirectory` is called; parser functions and content handlers must not be called.

Add an unmount-during-watch deferred case and assert the watcher is unregistered once the pending registration completes.

- [ ] **Step 2: Run watcher tests and verify RED**

Run: `pnpm exec vitest run test/electron/main/modules/workspace/watch.test.ts test/layouts/default/ai-resource-init.test.ts`

Expected: FAIL because only file-pattern `skill:changed` events exist.

- [ ] **Step 3: Implement resource-directory events in Electron**

Add the shared event shape to renderer and preload types:

```ts
export interface DirectoryChangeEvent {
  type: 'add' | 'unlink';
  rootPath: string;
  dirPath: string;
}
```

In `FileWatchService`, register Chokidar with `ignoreInitial: true` and `depth: 0`, emit only direct non-hidden `addDir` and `unlinkDir` children, and send `directory:changed` to all windows. Keep watcher keys scoped by root path. Add `ignoreInitial: true` to single-file watchers so opening an editor does not generate an initial `add` event and a second resource read.

Register IPC handlers:

```ts
ipcMain.handle('fs:watchResourceDirectory', async (_event, dirPath: string) => {
  await fileWatchService.watchResourceDirectory(dirPath);
});

ipcMain.handle('fs:unwatchResourceDirectory', async (_event, dirPath: string) => {
  await fileWatchService.unwatchResourceDirectory(dirPath);
});
```

Bridge the methods through preload, `ElectronAPI`, `Native`, and `ElectronNative`.

- [ ] **Step 4: Rewrite initialization Hooks around directory events**

The Skill Hook uses this concrete sequence; the Widget Hook uses `widgetStore.handleWidgetDirectory` and the `.tibis/widgets` root with the same lifecycle:

```ts
skillStore.prepareInitialization();
let disposed = false;
const cleanupCallbacks: Array<() => void | Promise<void>> = [];

onMounted(async (): Promise<void> => {
  const homeDir = await native.getHomeDir();
  const resourceRoot = joinPath(homeDir, '.agents', 'skills');
  if (disposed) return;
  const removeListener = native.onDirectoryChanged((event): void => {
    if (event.rootPath === resourceRoot) {
      skillStore.handleSkillDirectory(event.type, event.dirPath);
    }
  });
  cleanupCallbacks.push(removeListener);
  await native.watchResourceDirectory(resourceRoot);
  if (disposed) {
    await native.unwatchResourceDirectory(resourceRoot);
    return;
  }
  cleanupCallbacks.push(() => native.unwatchResourceDirectory(resourceRoot));
  await skillStore.init(homeDir, native);
});
```

The Widget callback is:

```ts
const removeListener = native.onDirectoryChanged((event): void => {
  if (event.rootPath === resourceRoot) {
    widgetStore.handleWidgetDirectory(event.type, event.dirPath);
  }
});
```

Normalize separators before root comparison and retain failure fallback through `finishInitialization()`.

- [ ] **Step 5: Run watcher tests and verify GREEN**

Run: `pnpm exec vitest run test/electron/main/modules/workspace/watch.test.ts test/layouts/default/ai-resource-init.test.ts`

Expected: PASS for direct-child filtering, lifecycle order, add/remove routing, and async cleanup.

---

### Task 6: Settings lists, Skill detail, creators, and deletion

**Files:**
- Modify: `src/views/settings/tools/skill/index.vue`
- Modify: `src/views/settings/tools/skill/detail.vue`
- Modify: `src/views/settings/tools/skill/components/SkillItemRow.vue`
- Modify: `src/views/settings/tools/skill/components/SkillPreview.vue`
- Modify: `src/views/settings/tools/skill/components/SkillCreator.vue`
- Modify: `src/views/settings/tools/widget/index.vue`
- Modify: `src/views/settings/tools/widget/components/WidgetItemRow.vue`
- Modify: `src/views/settings/tools/widget/components/WidgetCreator.vue`
- Modify: `src/router/routes/modules/settings.ts`
- Create: `test/views/settings/tools/skill/index.test.ts`
- Create: `test/views/settings/tools/skill/detail.test.ts`
- Modify: `test/views/settings/tools/skill/skill-item-row.test.ts`
- Modify: `test/views/settings/tools/skill/skill-creator.test.ts`
- Modify: `test/views/settings/tools/widget/index.test.ts`
- Modify: `test/views/settings/tools/widget/widget-item-row.test.ts`
- Modify: `test/views/settings/tools/widget/widget-creator.test.ts`

**Interfaces:**
- Consumes: Entry arrays, `fetchAll*`, `fetchSkill`, `update*Content`, `refresh*`, and ID-based toggles.
- Produces: Skill detail route keyed by directory ID.

- [ ] **Step 1: Write failing settings integration tests**

For both list pages, mount with unloaded Entries and assert `fetchAllSkills()` or `fetchAllWidgets()` is called once on mount. Resolve the fetch, attach definitions to Entries, and assert names/descriptions render.

For Skill detail, route with `{ id: 'weather' }`, make `fetchSkill('weather')` resolve an Entry, and assert:

```ts
expect(fetchSkillMock).toHaveBeenCalledWith('weather');
expect(wrapper.text()).toContain('Weather instructions');
expect(wrapper.findComponent(SkillPreviewStub).props('initialContent')).toBe(skillSource);
```

Update row tests to assert toggling and routing use `entry.id`, while display uses `entry.definition?.name ?? entry.id`.

- [ ] **Step 2: Run settings tests and verify RED**

Run: `pnpm exec vitest run test/views/settings/tools/skill/index.test.ts test/views/settings/tools/skill/detail.test.ts test/views/settings/tools/skill/skill-item-row.test.ts test/views/settings/tools/skill/skill-creator.test.ts test/views/settings/tools/widget/index.test.ts test/views/settings/tools/widget/widget-item-row.test.ts test/views/settings/tools/widget/widget-creator.test.ts`

Expected: FAIL because pages and rows still consume eager definitions.

- [ ] **Step 3: Load entries when list pages mount**

Add page-local loading state and call `fetchAll*()` from `onMounted`. Paginate Entry arrays, not Definition arrays. Render fallbacks:

```ts
const name = computed((): string => props.skill.definition?.name || props.skill.id);
const description = computed((): string => props.skill.definition?.description || props.skill.loadError || '未加载技能描述');
```

Widget rows use these explicit fallbacks:

```ts
const name = computed((): string => props.widget.definition?.name || props.widget.id);
const description = computed((): string => props.widget.definition?.description || props.widget.loadError || '未加载小组件描述');
const disabled = computed((): boolean => Boolean(props.widget.definition?.parseError));
```

Read failures remain retryable when the page is entered again.

- [ ] **Step 4: Make Skill detail fetch by directory ID and preview cached entry content**

Change the route segment from `:name` to `:id`. In `detail.vue`, watch the route ID, call `store.fetchSkill(id)`, and keep the returned Entry in a local ref. Add `initialContent?: string` to `SkillPreview`; `readContent(filePath)` must return this value only when `filePath === props.initialFilePath`, then continue reading auxiliary files with `native.readFile`.

The detail component passes:

```vue
<SkillPreview
  :root-path="skill.dirPath"
  :initial-file-path="skill.filePath"
  :initial-content="skill.sourceContent"
/>
```

- [ ] **Step 5: Update creator and deletion flows without eager rescans**

After Skill installation succeeds:

```ts
await store.refreshSkills();
store.updateSkillContent(skillName, rawSkillMd.value);
```

After Widget creation succeeds, serialize the exact installed `widgetData` and call:

```ts
await store.refreshWidgets();
store.updateWidgetContent(widgetId, JSON.stringify(widgetData, null, 2));
```

Conflict checks use directory IDs. Delete flows trash `entry.dirPath`, then call the appropriate directory refresh so the row disappears without reading other resource contents.

- [ ] **Step 6: Run settings tests and verify GREEN**

Run the command from Step 2.

Expected: PASS for list loading, detail caching, ID routing, creation, and deletion.

---

### Task 7: Chat catalog and tool execution consume Store caches

**Files:**
- Modify: `src/ai/tools/builtin/SkillTool/index.ts`
- Modify: `src/ai/tools/builtin/WidgetTool/index.ts`
- Modify: `src/ai/tools/builtin/index.ts`
- Modify: `src/components/BChat/hooks/useRuntimeTools.ts`
- Modify: `src/components/BChat/hooks/useRuntimeRequestConfig.ts`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/ai/tools/builtin-skill-tool.test.ts`
- Modify: `test/ai/tools/builtin-widget-tool.test.ts`
- Modify: `test/components/BChat/use-runtime-tools.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

**Interfaces:**
- Consumes: loaded Skill/Widget Entries and `fetchSkill`/`fetchWidget`.
- Produces: `getAIResources(): Promise<void>` before tool snapshot construction.
- Removes: execution-time forced disk refresh contracts.

- [ ] **Step 1: Write failing chat and tool tests**

Change Store mocks to return Entries. Assert runtime preparation calls both bulk fetch functions before `getActiveTools()` and hash construction:

```ts
expect(callOrder).toEqual(['skill-fetch-all', 'widget-fetch-all', 'get-active-tools', 'get-skill-hashes']);
```

For Skill execution, provide an enabled Entry with a loaded definition, make `fetchSkill(entry.id)` return it, invoke the tool by frontmatter name, and assert the cached content is returned without a native read contract.

For Widget and `open_widget`, assert `fetchWidget(id)` is called and both tools use the returned cached definition.

- [ ] **Step 2: Run chat/tool tests and verify RED**

Run: `pnpm exec vitest run test/ai/tools/builtin-skill-tool.test.ts test/ai/tools/builtin-widget-tool.test.ts test/components/BChat/use-runtime-tools.test.ts test/components/BChat/session-id-runtime.test.ts`

Expected: FAIL because tools still receive Definitions and runtime calls `syncFromDisk()`.

- [ ] **Step 3: Update tool Store contracts to Entries**

Skill tool contract:

```ts
export interface SkillStoreLike {
  initialized: boolean;
  getEnabledSkills: () => SkillEntry[];
  getSkillByName: (name: string) => SkillEntry | undefined;
  fetchSkill: (id: string) => Promise<SkillEntry>;
}
```

Widget tool contract:

```ts
export interface WidgetStoreLike {
  initialized: boolean;
  getEnabledWidgets: () => WidgetEntry[];
  fetchWidget: (id: string) => Promise<WidgetEntry>;
}
```

Descriptions read `entry.definition`. Skill execution resolves the Entry by parsed name, calls `fetchSkill(entry.id)`, and rejects absent or parse-invalid definitions. Widget execution calls `fetchWidget(input.id)` and reads the cached definition. Builtin shell workspace roots use `entry.dirPath`.

- [ ] **Step 4: Replace disk synchronization with bulk fetch**

Rename `syncAIResources` to `getAIResources` through `useRuntimeTools`, `useRuntimeRequestConfig`, and `BChat/index.vue`:

```ts
async function getAIResources(): Promise<void> {
  await Promise.allSettled([skillStore.waitForInit(), widgetStore.waitForInit()]);
  const results = await Promise.all([skillStore.fetchAllSkills(), widgetStore.fetchAllWidgets()]);
  for (const result of results.flat()) {
    if (result.status === 'rejected') {
      console.error('AI resource fetch failed:', result.reason);
    }
  }
}
```

Build Skill hashes from `entry.definition?.contentHash` after the bulk fetch. Dynamic tool registration checks enabled Entries with valid definitions. Remove uses of `syncFromDisk`, `resolveLatestEnabledSkill`, and `resolveLatestEnabledWidget` from chat/tool code.

- [ ] **Step 5: Run chat/tool tests and verify GREEN**

Run the command from Step 2.

Expected: PASS; chat loads resources once before schema creation and executions reuse Store content.

---

### Task 8: Widget editor uses and updates Widget Store content

**Files:**
- Modify: `src/views/widget/hooks/useSession.ts`
- Modify: `test/views/widget/use-session.test.ts`

**Interfaces:**
- Consumes: `fetchWidget(id)` and `updateWidgetContent(id, sourceContent)`.
- Preserves: recent draft reconciliation, saved baseline, active file watching, and external-change confirmation.

- [ ] **Step 1: Write failing Widget session tests**

Replace `getWidgetById`/initial `native.readFile` mocks with `fetchWidget`. Assert initial load uses Store content and does not call `native.readFile`:

```ts
expect(fetchWidgetMock).toHaveBeenCalledWith('weather');
expect(readFileMock).not.toHaveBeenCalled();
```

Keep existing draft conflict cases but feed the Store source as the disk baseline. Add assertions that successful save and accepted external content call:

```ts
expect(updateWidgetContentMock).toHaveBeenCalledWith('weather', savedContent);
```

Emit an initial-style `add` event with content equal to the Store snapshot and assert no extra read or update occurs.

- [ ] **Step 2: Run Widget session tests and verify RED**

Run: `pnpm exec vitest run test/views/widget/use-session.test.ts`

Expected: FAIL because `useSession` currently resolves a path from Store and reads `widget.json` directly.

- [ ] **Step 3: Replace initial disk read with `fetchWidget`**

Resolve the installed resource ID, fetch the Entry, and convert its source to the existing file-session shape:

```ts
async function resolveWidgetEntry(): Promise<WidgetEntry | null> {
  await widgetStore.waitForInit();
  try {
    return await widgetStore.fetchWidget(resolveWidgetId(fileId.value));
  } catch {
    return null;
  }
}
```

Use `entry.filePath` and `entry.sourceContent` as the installed file snapshot. Keep the stored draft reconciliation branches unchanged except that their comparison input comes from the Entry rather than `native.readFile`.

- [ ] **Step 4: Update Store content after accepted changes**

After a successful `native.writeFile` or save dialog result, call `updateWidgetContent`. After `applyExternalContent(content)` succeeds, call the same method. Do not update Store for ignored external changes or unsaved local drafts.

- [ ] **Step 5: Run Widget session tests and verify GREEN**

Run: `pnpm exec vitest run test/views/widget/use-session.test.ts`

Expected: PASS; initial resource content comes from Store and draft behavior remains intact.

---

### Task 9: Generic saved-file event updates Skill cache

**Files:**
- Modify: `src/stores/helpers/events.ts`
- Modify: `src/views/editor/hooks/useSession.ts`
- Modify: `src/layouts/default/hooks/useSkillInit.ts`
- Modify: `src/stores/ai/skill.ts`
- Modify: `test/views/editor/use-session-save-dialog.test.ts`
- Modify: `test/layouts/default/ai-resource-init.test.ts`
- Modify: `test/stores/ai/skill.test.ts`

**Interfaces:**
- Produces: `storeEvents.emitFileSaved(filePath, content)` and `storeEvents.onFileSaved(handler)`.
- Produces Skill Store method: `handleFileSaved(filePath, content): void`.

- [ ] **Step 1: Write failing save-event tests**

Add an event listener in the editor save test and assert both existing-path save and save-dialog completion emit the exact final path/content:

```ts
expect(fileSavedHandler).toHaveBeenCalledWith({
  filePath: '/Users/test/.agents/skills/weather/SKILL.md',
  content: markdown
});
```

In the Skill Store test, call `handleFileSaved` with a matching entry path and assert it fills or replaces `sourceContent`; call it with an unrelated path and assert no Entry changes.

In the Hook test, emit the generic saved-file event and assert the Hook forwards it to `skillStore.handleFileSaved`.

- [ ] **Step 2: Run save synchronization tests and verify RED**

Run: `pnpm exec vitest run test/views/editor/use-session-save-dialog.test.ts test/layouts/default/ai-resource-init.test.ts test/stores/ai/skill.test.ts`

Expected: FAIL because the saved-file event and Skill path handler do not exist.

- [ ] **Step 3: Add typed saved-file Store events**

```ts
export interface FileSavedPayload {
  filePath: string;
  content: string;
}

emitFileSaved(filePath: string, content: string): void {
  emitter.emit(this.fileSaved, { filePath, content } satisfies FileSavedPayload);
}

onFileSaved(handler: (payload: FileSavedPayload) => void): () => void {
  return emitter.on(this.fileSaved, handler as (payload: unknown) => void);
}
```

Add the `fileSaved` event name alongside existing missing/recovered events.

- [ ] **Step 4: Emit after every successful generic editor save**

After `native.writeFile`, `native.saveFile`, missing-file restore, and overwrite flows have successfully finalized their save state, call:

```ts
storeEvents.emitFileSaved(savedPath, fileState.value.content);
```

Do not emit for cancelled dialogs, skipped saves, or failed writes.

- [ ] **Step 5: Forward saved Skill files to the Store**

Implement `handleFileSaved` by normalized exact `filePath` lookup; when matched, call `updateSkillContent(entry.id, content)`. Subscribe from `useSkillInit` and add the unsubscribe callback to the existing cleanup list. This event is application-owned save synchronization, not global disk-change invalidation.

- [ ] **Step 6: Run save synchronization tests and verify GREEN**

Run the command from Step 2.

Expected: PASS; application saves update Skill cache without coupling the generic editor to the Skill Store.

---

### Task 10: Changelog, focused regression, and repository verification

**Files:**
- Modify or create: `changelog/2026-07-15.md`
- Review: every file listed in Tasks 1–9

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: verified workspace changes ready for the user's single final commit.

- [ ] **Step 1: Add the changelog entry**

Under `## Changed`, add:

```md
- Skill 与 Widget 改为目录索引先行、内容首次使用时由 Store 加载并缓存，设置页、聊天和编辑器统一复用缓存且应用内保存会同步更新。
```

If the date file does not exist, create it with `# 2026-07-15` and the `## Changed` section.

- [ ] **Step 2: Run all focused tests**

Run:

```bash
pnpm exec vitest run \
  test/utils/shared-request.test.ts \
  test/ai/skill/parser.test.ts \
  test/ai/widget/parser.test.ts \
  test/ai/skill/scanner.test.ts \
  test/ai/widget/scanner.test.ts \
  test/stores/ai/skill.test.ts \
  test/stores/ai/widget.test.ts \
  test/electron/main/modules/workspace/watch.test.ts \
  test/layouts/default/ai-resource-init.test.ts \
  test/views/settings/tools/skill/index.test.ts \
  test/views/settings/tools/skill/detail.test.ts \
  test/views/settings/tools/skill/skill-item-row.test.ts \
  test/views/settings/tools/skill/skill-creator.test.ts \
  test/views/settings/tools/widget/index.test.ts \
  test/views/settings/tools/widget/widget-item-row.test.ts \
  test/views/settings/tools/widget/widget-creator.test.ts \
  test/ai/tools/builtin-skill-tool.test.ts \
  test/ai/tools/builtin-widget-tool.test.ts \
  test/components/BChat/use-runtime-tools.test.ts \
  test/components/BChat/session-id-runtime.test.ts \
  test/views/widget/use-session.test.ts \
  test/views/editor/use-session-save-dialog.test.ts
```

Expected: all focused test files pass.

- [ ] **Step 3: Run static repository checks**

Run each command independently:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
git diff --check
```

Expected: every command exits with code 0.

- [ ] **Step 4: Review scope and leave the workspace uncommitted**

Run:

```bash
git status --short
git diff --stat
git diff -- docs/superpowers/specs/2026-07-15-ai-resource-lazy-loading-design.md docs/superpowers/plans/2026-07-15-ai-resource-lazy-loading.md
```

Expected: only the planned implementation, design, plan, tests, and changelog appear. Do not stage or commit any file.
