# Widget Sidebar Element Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Widget 元素工具按“基础”和“交互”两个常驻分组展示，同时保持现有拖拽创建行为。

**Architecture:** 元素 Schema 增加必填分类键，元素注册入口集中导出有序分类定义。`SidebarTools.vue` 使用 `lodash-es/groupBy` 将注册元素归组，再按分类定义顺序渲染非空分组；分类信息只影响侧栏展示，不进入 Widget 持久化数据。

**Tech Stack:** Vue 3、TypeScript strict、lodash-es、Vitest、Vue Test Utils、Less、ESLint、Stylelint

**Commit policy:** 用户要求最终自行提交。本计划不执行 `git add` 或 `git commit`。

---

## 文件结构

- Modify: `src/components/BWidget/elements/types.ts` — 定义分类键、分类定义及 Schema 分类字段。
- Modify: `src/components/BWidget/elements/index.ts` — 导出分类定义，并继续作为元素注册入口。
- Modify: `src/components/BWidget/elements/Rect/schema.ts` — 将矩形归入基础分类。
- Modify: `src/components/BWidget/elements/Text/schema.ts` — 将文本归入基础分类。
- Modify: `src/components/BWidget/elements/Image/schema.ts` — 将图片归入基础分类。
- Modify: `src/components/BWidget/elements/Button/schema.ts` — 将按钮归入交互分类。
- Modify: `src/views/widget/components/SidebarTools.vue` — 分组并渲染工具列表。
- Modify: `test/components/BWidget/widget-elements-registry.test.ts` — 验证分类定义和元素归属。
- Modify: `test/views/widget/sidebar-tools-drag.test.ts` — 验证分组展示及原拖拽行为。
- Modify: `changelog/2026-07-13.md` — 记录侧栏分类展示改动。

### Task 1: 用注册测试固定分类契约

**Files:**
- Modify: `test/components/BWidget/widget-elements-registry.test.ts`

- [ ] **Step 1: 写入失败测试**

扩展导入并增加分类断言：

```typescript
import type { WidgetElementRole, WidgetElementSchema } from '@/components/BWidget/elements';
import {
  getWidgetElementSchema,
  getWidgetElementSetter,
  getWidgetElementView,
  WIDGET_ELEMENT_ROLES,
  WIDGET_ELEMENT_SCHEMAS
} from '@/components/BWidget/elements';

it('registers ordered sidebar categories and assigns every element', (): void => {
  expect(WIDGET_ELEMENT_ROLES).toEqual([
    { key: 'basic', label: '基础' },
    { key: 'interaction', label: '交互' }
  ]);

  const categoriesByElementName = Object.fromEntries(
    WIDGET_ELEMENT_SCHEMAS.map((schema: WidgetElementSchema): [string, WidgetElementRole] => [schema.name, schema.role])
  );

  expect(categoriesByElementName).toEqual({
    rect: 'basic',
    text: 'basic',
    image: 'basic',
    button: 'interaction'
  });
});
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts
```

Expected: FAIL，提示 `WIDGET_ELEMENT_ROLES` 或 `WidgetElementRole` 尚未导出，或 Schema 缺少 `role`。

### Task 2: 用组件测试固定分组展示与拖拽行为

**Files:**
- Modify: `test/views/widget/sidebar-tools-drag.test.ts`

- [ ] **Step 1: 为测试 Schema 和模块 mock 增加分类数据**

将单个 `toolSchema` 改成两个分类下的测试数据：

```typescript
/** 测试基础工具 schema。 */
const basicToolSchema = vi.hoisted(
  (): WidgetElementSchema => ({
    role: 'basic',
    name: 'layout',
    label: '布局容器',
    icon: 'lucide:layout-template'
  })
);

/** 测试交互工具 schema。 */
const interactionToolSchema = vi.hoisted(
  (): WidgetElementSchema => ({
    role: 'interaction',
    name: 'trigger',
    label: '触发器',
    icon: 'lucide:mouse-pointer-click'
  })
);

vi.mock('@/components/BWidget/elements', () => ({
  WIDGET_ELEMENT_ROLES: [
    { key: 'basic', label: '基础' },
    { key: 'interaction', label: '交互' }
  ],
  WIDGET_ELEMENT_SCHEMAS: [basicToolSchema, interactionToolSchema]
}));
```

- [ ] **Step 2: 增加分组展示失败测试**

增加 `VueWrapper`、`DOMWrapper` 和 `Mock` 类型导入：

```typescript
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import type { Mock } from 'vitest';
```

提取现有挂载逻辑为有 JSDoc 的测试辅助函数：

```typescript
/** 侧栏拖拽函数。 */
type StartDrag = (_schema: DraggerItem, _event?: PointerEvent) => void;

/**
 * 已挂载的侧栏工具测试上下文。
 */
interface MountSidebarToolsResult {
  /** 组件包装器 */
  wrapper: VueWrapper;
  /** 拖拽启动 mock */
  startDrag: Mock<StartDrag>;
}

/**
 * 挂载带拖拽上下文的侧栏工具组件。
 * @returns 组件包装器和拖拽启动 mock
 */
function mountSidebarTools(): MountSidebarToolsResult {
  const startDrag = vi.fn<StartDrag>();
  const Host = defineComponent({
    name: 'SidebarToolsDragHost',
    components: {
      SidebarTools
    },
    setup(): Record<string, never> {
      provideDragger({ startDrag });

      return {};
    },
    template: '<SidebarTools />'
  });
  const wrapper = mount(Host, {
    global: {
      stubs: {
        BIcon: true
      }
    }
  });

  return { startDrag, wrapper };
}
```

再增加分组断言：

```typescript
it('renders tools under ordered category headings', (): void => {
  const { wrapper } = mountSidebarTools();
  const categories = wrapper.findAll('.sidebar-tools__category');

  expect(categories).toHaveLength(2);
  expect(categories[0]?.find('.sidebar-tools__category-title').text()).toBe('基础');
  expect(categories[0]?.findAll('.sidebar-tools__tool-item').map((item: DOMWrapper<Element>): string => item.text())).toEqual(['布局容器']);
  expect(categories[1]?.find('.sidebar-tools__category-title').text()).toBe('交互');
  expect(categories[1]?.findAll('.sidebar-tools__tool-item').map((item: DOMWrapper<Element>): string => item.text())).toEqual(['触发器']);

  wrapper.unmount();
});
```

原拖拽测试改为调用 `mountSidebarTools()`，将选择器更新为 `.sidebar-tools__tool-item`，其余完整 Schema、事件参数和 `drag-start` 断言保持不变。

- [ ] **Step 3: 运行组件测试并确认失败原因**

Run:

```bash
pnpm exec vitest run test/views/widget/sidebar-tools-drag.test.ts
```

Expected: FAIL，当前组件尚未渲染 `.sidebar-tools__category` 和分类标题。

### Task 3: 实现分类类型和元素注册信息

**Files:**
- Modify: `src/components/BWidget/elements/types.ts`
- Modify: `src/components/BWidget/elements/index.ts`
- Modify: `src/components/BWidget/elements/Rect/schema.ts`
- Modify: `src/components/BWidget/elements/Text/schema.ts`
- Modify: `src/components/BWidget/elements/Image/schema.ts`
- Modify: `src/components/BWidget/elements/Button/schema.ts`

- [ ] **Step 1: 定义分类类型和分类定义接口**

在 `src/components/BWidget/elements/types.ts` 中加入：

```typescript
/**
 * Widget 元素工具分类键。
 */
export type WidgetElementRole = 'basic' | 'interaction';

/**
 * Widget 元素工具分类定义。
 */
export interface WidgetElementRoleDefinition {
  /** 分类稳定标识 */
  key: WidgetElementRole;
  /** 分类显示名称 */
  label: string;
}
```

在 `WidgetElementSchema` 的 `name` 前加入：

```typescript
/** 元素所属工具分类 */
role: WidgetElementRole;
```

- [ ] **Step 2: 注册有序分类并导出类型**

在 `src/components/BWidget/elements/index.ts` 中导入 `WidgetElementRoleDefinition`，并在 `WIDGET_ELEMENT_SCHEMAS` 前加入：

```typescript
/**
 * BWidget 侧边栏元素分类定义，数组顺序即展示顺序。
 */
export const WIDGET_ELEMENT_ROLES: WidgetElementRoleDefinition[] = [
  { key: 'basic', label: '基础' },
  { key: 'interaction', label: '交互' }
];
```

文件末尾导出完整分类类型：

```typescript
export type {
  WidgetElementRole,
  WidgetElementRoleDefinition,
  WidgetElementRenderSizeConfig,
  WidgetElementRenderSizeSource,
  WidgetElementSchema
} from './types';
```

- [ ] **Step 3: 为四个元素 Schema 填写分类键**

在矩形、文本和图片 Schema 中加入：

```typescript
role: 'basic',
```

在按钮 Schema 中加入：

```typescript
role: 'interaction',
```

字段放在 `name` 之前，所有 Schema 保持一致顺序。

- [ ] **Step 4: 运行注册测试确认通过**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts
```

Expected: PASS。

### Task 4: 实现侧栏分组渲染

**Files:**
- Modify: `src/views/widget/components/SidebarTools.vue`

- [ ] **Step 1: 将模板改成分类标题和分类网格**

用下列结构替换 `SidebarPanel` 内部的单层网格：

```vue
<div class="sidebar-tools__categories">
  <section v-for="category in widgetElementCategories" :key="category.key" class="sidebar-tools__category">
    <h3 class="sidebar-tools__category-title">{{ category.label }}</h3>
    <div class="sidebar-tools__tool-grid">
      <div
        v-for="schema in category.elements"
        :key="schema.name"
        class="sidebar-tools__tool-item"
        @pointerdown.left.prevent="handleToolPointerdown(schema, $event)"
      >
        <BIcon :icon="schema.icon" :size="16" />
        <span>{{ schema.label }}</span>
      </div>
    </div>
  </section>
</div>
```

- [ ] **Step 2: 使用 groupBy 构造有序非空分类**

在脚本中使用以下类型和辅助函数：

```typescript
import { groupBy } from 'lodash-es';
import {
  WIDGET_ELEMENT_ROLES,
  WIDGET_ELEMENT_SCHEMAS,
  type WidgetElementRoleDefinition,
  type WidgetElementSchema
} from '@/components/BWidget/elements';

/**
 * 带有已注册元素的侧栏分类。
 */
interface WidgetElementCategoryGroup extends WidgetElementRoleDefinition {
  /** 当前分类下的元素 Schema */
  elements: WidgetElementSchema[];
}

/** 按分类键索引的元素 Schema。 */
const elementSchemasByCategory = groupBy(WIDGET_ELEMENT_SCHEMAS, 'role');

/**
 * 为分类定义附加其元素列表。
 * @param category - 元素分类定义
 * @returns 包含元素列表的侧栏分类
 */
function createElementCategoryGroup(category: WidgetElementRoleDefinition): WidgetElementCategoryGroup {
  return {
    ...category,
    elements: elementSchemasByCategory[category.key] ?? []
  };
}

/**
 * 判断侧栏分类是否包含元素。
 * @param category - 侧栏分类
 * @returns 是否应展示该分类
 */
function hasCategoryElements(category: WidgetElementCategoryGroup): boolean {
  return category.elements.length > 0;
}

/** 当前侧栏展示的有序非空元素分类。 */
const widgetElementCategories = WIDGET_ELEMENT_ROLES.map(createElementCategoryGroup).filter(hasCategoryElements);
```

- [ ] **Step 3: 更新完整类名样式**

将原工具网格和工具项样式迁移到 `sidebar-tools` 前缀，并增加分类布局：

```less
.sidebar-tools__categories {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar-tools__category {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-tools__category-title {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.sidebar-tools__tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.sidebar-tools__tool-item {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  overflow: hidden;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: grab;
  user-select: none;
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
}

.sidebar-tools__tool-item:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-color: var(--border-primary);
}

.sidebar-tools__tool-item:active {
  cursor: grabbing;
}
```

这些声明仅更换类名前缀，不改变颜色、尺寸、边框或拖拽光标。

- [ ] **Step 4: 运行侧栏组件测试确认通过**

Run:

```bash
pnpm exec vitest run test/views/widget/sidebar-tools-drag.test.ts
```

Expected: PASS。

### Task 5: 记录变更并完成验证

**Files:**
- Modify: `changelog/2026-07-13.md`

- [ ] **Step 1: 更新 changelog**

在 `## Changed` 下增加：

```markdown
- Widget 组件侧栏按“基础”和“交互”分类展示元素，元素分类由各自 Schema 声明，方便后续扩展。
```

- [ ] **Step 2: 运行定向测试**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts
```

Expected: 两个测试文件全部 PASS。

- [ ] **Step 3: 运行 ESLint 检查**

Run:

```bash
pnpm exec eslint src/components/BWidget/elements src/views/widget/components/SidebarTools.vue test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts --ext .vue,.ts
```

Expected: exit code 0，无 ESLint 错误。

- [ ] **Step 4: 运行 Stylelint 检查**

Run:

```bash
pnpm exec stylelint 'src/views/widget/components/SidebarTools.vue'
```

Expected: exit code 0，无 Stylelint 错误。

- [ ] **Step 5: 运行 TypeScript 类型检查**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: exit code 0，无 TypeScript 错误。

- [ ] **Step 6: 检查最终工作区差异**

Run:

```bash
git status --short
git diff --check
```

Expected: 仅显示本功能相关实现、测试、设计/计划文档和 changelog；`git diff --check` 无输出。不要暂存或提交文件。

### Task 6: 将分类定义收敛为唯一事实来源

**Files:**
- Create: `src/components/BWidget/elements/roles.ts`
- Modify: `src/components/BWidget/elements/types.ts`
- Modify: `src/components/BWidget/elements/index.ts`
- Modify: `src/views/widget/components/SidebarTools.vue`
- Modify: `test/components/BWidget/widget-elements-registry.test.ts`

- [ ] **Step 1: 让注册测试直接依赖分类定义模块**

将分类常量和分类类型改为从尚未创建的模块导入，并增加类型派生与注册不变量断言：

```typescript
import type { WidgetElementSchema } from '@/components/BWidget/elements';
import type { WidgetElementRole } from '@/components/BWidget/elements/roles';
import { WIDGET_ELEMENT_ROLES } from '@/components/BWidget/elements/roles';
import { expectTypeOf } from 'vitest';

it('derives category keys from the ordered category definitions', (): void => {
  expectTypeOf<WidgetElementRole>().toEqualTypeOf<(typeof WIDGET_ELEMENT_ROLES)[number]['key']>();

  const categoryKeys = new Set<WidgetElementRole>(WIDGET_ELEMENT_ROLES.map((category): WidgetElementRole => category.key));

  expect(WIDGET_ELEMENT_SCHEMAS.every((schema: WidgetElementSchema): boolean => categoryKeys.has(schema.role))).toBe(true);
});
```

- [ ] **Step 2: 运行测试并确认分类模块缺失**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts
```

Expected: FAIL，提示无法解析 `@/components/BWidget/elements/roles`。

- [ ] **Step 3: 创建分类定义唯一来源**

创建 `src/components/BWidget/elements/roles.ts`：

```typescript
/**
 * @file roles.ts
 * @description BWidget 元素工具分类定义与派生类型。
 */

/**
 * BWidget 侧边栏元素分类定义，数组顺序即展示顺序。
 */
export const WIDGET_ELEMENT_ROLES = [
  { key: 'basic', label: '基础' },
  { key: 'interaction', label: '交互' }
] as const;

/**
 * Widget 元素工具分类键，由分类定义自动派生。
 */
export type WidgetElementRole = (typeof WIDGET_ELEMENT_ROLES)[number]['key'];

/**
 * Widget 元素工具分类定义，由有序分类常量自动派生。
 */
export type WidgetElementRoleDefinition = (typeof WIDGET_ELEMENT_ROLES)[number];
```

- [ ] **Step 4: 调整类型与注册入口**

`src/components/BWidget/elements/types.ts` 从 `./roles` 类型导入 `WidgetElementRole`，删除本地分类联合类型和分类定义接口。

`src/components/BWidget/elements/index.ts` 删除本地 `WIDGET_ELEMENT_ROLES`，改为统一转出：

```typescript
export { WIDGET_ELEMENT_ROLES } from './roles';
export type { WidgetElementRole, WidgetElementRoleDefinition } from './roles';
```

其余元素类型继续从 `./types` 转出。

- [ ] **Step 5: 让侧栏分类组兼容派生的定义联合类型**

将 `WidgetElementCategoryGroup` 从接口改为交叉类型：

```typescript
/**
 * 带有已注册元素的侧栏分类。
 */
type WidgetElementCategoryGroup = WidgetElementRoleDefinition & {
  /** 当前分类下的元素 Schema */
  elements: WidgetElementSchema[];
};
```

- [ ] **Step 6: 运行验证**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts
pnpm exec eslint src/components/BWidget/elements src/views/widget/components/SidebarTools.vue test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts --ext .vue,.ts
pnpm exec stylelint 'src/views/widget/components/SidebarTools.vue'
pnpm exec tsc --noEmit
```

Expected: 所有命令 exit code 0。不要暂存或提交文件。

### Task 7: 统一 roles.ts 的公开定义命名

**Files:**
- Modify: `src/components/BWidget/elements/roles.ts`
- Modify: `src/components/BWidget/elements/types.ts`
- Modify: `src/components/BWidget/elements/index.ts`
- Modify: `src/views/widget/components/SidebarTools.vue`
- Modify: `test/components/BWidget/widget-elements-registry.test.ts`
- Modify: `test/views/widget/sidebar-tools-drag.test.ts`

- [ ] **Step 1: 先将测试契约切换到 Role 命名**

测试改为使用：

```typescript
import type { WidgetElementRole } from '@/components/BWidget/elements/roles';
import { WIDGET_ELEMENT_ROLES } from '@/components/BWidget/elements/roles';
```

侧栏模块 mock 同步提供 `WIDGET_ELEMENT_ROLES`。类型派生断言改为：

```typescript
expectTypeOf<WidgetElementRole>().toEqualTypeOf<(typeof WIDGET_ELEMENT_ROLES)[number]['key']>();
```

- [ ] **Step 2: 运行测试确认旧公开名称不满足契约**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts
```

Expected: FAIL，提示 `roles.ts` 或元素注册入口尚未导出 Role 命名。

- [ ] **Step 3: 统一生产代码公开名称**

`src/components/BWidget/elements/roles.ts` 导出：

```typescript
export const WIDGET_ELEMENT_ROLES = [
  { key: 'basic', label: '基础' },
  { key: 'interaction', label: '交互' }
] as const;

export type WidgetElementRole = (typeof WIDGET_ELEMENT_ROLES)[number]['key'];
export type WidgetElementRoleDefinition = (typeof WIDGET_ELEMENT_ROLES)[number];
```

`types.ts` 的 `WidgetElementSchema.role` 使用 `WidgetElementRole`；`SidebarTools.vue` 直接从 `./roles` 对应别名路径导入 `WIDGET_ELEMENT_ROLES` 与 `WidgetElementRoleDefinition`。侧栏局部 category 变量和 CSS 类名保持不变。

- [ ] **Step 4: 运行完整验证**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts
pnpm exec eslint src/components/BWidget/elements src/views/widget/components/SidebarTools.vue test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts --ext .vue,.ts
pnpm exec stylelint 'src/views/widget/components/SidebarTools.vue'
pnpm exec tsc --noEmit
```

Expected: 所有命令 exit code 0。不要暂存或提交文件。

### Task 8: 取消元素注册入口的角色重复转出

**Files:**
- Modify: `src/components/BWidget/elements/index.ts`
- Modify: `src/views/widget/components/SidebarTools.vue`
- Modify: `test/views/widget/sidebar-tools-drag.test.ts`

- [ ] **Step 1: 移除注册入口转出**

从 `src/components/BWidget/elements/index.ts` 删除：

```typescript
export { WIDGET_ELEMENT_ROLES } from './roles';
export type { WidgetElementRole, WidgetElementRoleDefinition } from './roles';
```

- [ ] **Step 2: 消费者直接导入 roles 模块**

`SidebarTools.vue` 使用：

```typescript
import type { WidgetElementRoleDefinition } from '@/components/BWidget/elements/roles';
import { WIDGET_ELEMENT_ROLES } from '@/components/BWidget/elements/roles';
```

`WidgetElementSchema` 和 `WIDGET_ELEMENT_SCHEMAS` 仍从 `@/components/BWidget/elements` 导入。

- [ ] **Step 3: 拆分侧栏测试 mock**

`@/components/BWidget/elements` mock 只提供 `WIDGET_ELEMENT_SCHEMAS`；`@/components/BWidget/elements/roles` mock 单独提供带空角色的 `WIDGET_ELEMENT_ROLES`，继续覆盖空分组过滤。

- [ ] **Step 4: 运行验证**

Run:

```bash
pnpm exec vitest run test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts
pnpm exec eslint src/components/BWidget/elements src/views/widget/components/SidebarTools.vue test/components/BWidget/widget-elements-registry.test.ts test/views/widget/sidebar-tools-drag.test.ts --ext .vue,.ts
pnpm exec stylelint 'src/views/widget/components/SidebarTools.vue'
pnpm exec tsc --noEmit
```

Expected: 所有命令 exit code 0。不要暂存或提交文件。
