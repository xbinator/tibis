# BSegmented Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tibis-native `BSegmented` component and migrate only the drawing `DesignSetter.vue` text alignment control to it.

**Architecture:** Build `BSegmented` as a focused Vue component with separate exported types. It uses `createNamespace('segmented')`, `useVModel`, `useResizeObserver`, and existing theme tokens. `DesignSetter.vue` consumes the global component without migrating other `ASegmented` users.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Less, Vue Test Utils, Vitest, `@vueuse/core`.

**Repository Rule:** Do not run `git add` or `git commit` for this implementation. The user will review and commit the final changes.

---

### Task 1: Add Failing BSegmented Component Tests

**Files:**
- Create: `test/components/BSegmented/index.test.ts`
- Create later: `src/components/BSegmented/index.vue`
- Create later: `src/components/BSegmented/types.ts`

- [ ] **Step 1: Write the failing tests**

```ts
/**
 * @file index.test.ts
 * @description 验证 BSegmented 的选项渲染、模型更新、禁用态、自定义标签与懒渲染内容。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BSegmented from '@/components/BSegmented/index.vue';
import type { BSegmentedOption, BSegmentedValue } from '@/components/BSegmented/types';

class ResizeObserverMock {
  public constructor(private readonly callback: ResizeObserverCallback) {}
  public observe(target: Element): void {
    this.callback([{ target, contentRect: new DOMRect(0, 0, 300, 32) } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  public unobserve(): void {}
  public disconnect(): void {}
}

const OPTIONS: BSegmentedOption[] = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right', disabled: true }
];

function mountSegmented(props: { value?: BSegmentedValue; options?: BSegmentedOption[] } = {}): VueWrapper {
  return mount(BSegmented, {
    props: {
      options: props.options ?? OPTIONS,
      value: props.value
    },
    attachTo: document.body
  });
}

describe('BSegmented', (): void => {
  beforeEach((): void => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders labels from options', (): void => {
    const wrapper = mountSegmented({ value: 'left' });
    expect(wrapper.text()).toContain('左对齐');
    expect(wrapper.text()).toContain('居中');
    expect(wrapper.text()).toContain('右对齐');
  });

  it('defaults to the first enabled option when value is unset', async (): Promise<void> => {
    const wrapper = mountSegmented();
    await nextTick();
    expect(wrapper.findAll('.b-segmented__tab')[0].classes()).toContain('is-active');
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['left']);
  });

  it('emits update:value and change when clicking another option', async (): Promise<void> => {
    const wrapper = mountSegmented({ value: 'left' });
    await wrapper.findAll('.b-segmented__tab')[1].trigger('click');
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['center']);
    expect(wrapper.emitted('change')?.[0]).toEqual(['center', OPTIONS[1]]);
  });

  it('does not switch to a disabled option', async (): Promise<void> => {
    const wrapper = mountSegmented({ value: 'left' });
    await wrapper.findAll('.b-segmented__tab')[2].trigger('click');
    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.findAll('.b-segmented__tab')[0].classes()).toContain('is-active');
  });

  it('renders the label slot with the option record', (): void => {
    const wrapper = mount(BSegmented, {
      props: {
        value: 'left',
        options: OPTIONS
      },
      slots: {
        label: '<template #label="{ record, active }"><span class="custom-label">{{ record.value }}:{{ active }}</span></template>'
      }
    });
    expect(wrapper.find('.custom-label').text()).toBe('left:true');
  });

  it('lazily renders named content slots after activation', async (): Promise<void> => {
    const Host = defineComponent({
      components: { BSegmented },
      setup(): { active: Ref<BSegmentedValue>; options: BSegmentedOption[] } {
        const active = ref<BSegmentedValue>('left');
        return { active, options: OPTIONS };
      },
      template: `
        <BSegmented v-model:value="active" :options="options">
          <template #left><div class="left-panel">left panel</div></template>
          <template #center><div class="center-panel">center panel</div></template>
        </BSegmented>
      `
    });
    const wrapper = mount(Host);
    expect(wrapper.find('.left-panel').exists()).toBe(true);
    expect(wrapper.find('.center-panel').exists()).toBe(false);
    await wrapper.findAll('.b-segmented__tab')[1].trigger('click');
    expect(wrapper.find('.center-panel').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/components/BSegmented/index.test.ts`

Expected: FAIL because `src/components/BSegmented/index.vue` and `src/components/BSegmented/types.ts` do not exist.

### Task 2: Implement BSegmented

**Files:**
- Create: `src/components/BSegmented/types.ts`
- Create: `src/components/BSegmented/index.vue`
- Modify: `vite.config.ts`

- [ ] **Step 1: Add typed component contracts**

Create `src/components/BSegmented/types.ts` with exported value, option, and props types using `unknown` for extension payloads.

- [ ] **Step 2: Add component implementation**

Create `src/components/BSegmented/index.vue` with:

- `defineOptions({ name: 'BSegmented' })`
- `createNamespace('segmented')`
- `useVModel`
- a selected value sync watcher that falls back to the first enabled option
- disabled-option click protection
- lazy visible slot tracking with `Set<BSegmentedValue>`
- `useResizeObserver` on the tab container
- full Less selectors such as `.b-segmented__tab`

- [ ] **Step 3: Register the component directory**

Add `BSegmented` to the `COMPONENT_DIRS` list in `vite.config.ts`.

- [ ] **Step 4: Run the component test to verify it passes**

Run: `pnpm test test/components/BSegmented/index.test.ts`

Expected: PASS.

### Task 3: Migrate DesignSetter Only

**Files:**
- Modify: `src/views/drawing/components/DesignSetter.vue`
- Modify: `test/views/drawing/settings-panel.test.ts`

- [ ] **Step 1: Write or update the focused source-level test**

Add assertions that `DesignSetter.vue` no longer imports `Segmented as ASegmented` and uses `<BSegmented`.

- [ ] **Step 2: Run the drawing test to verify it fails**

Run: `pnpm test test/views/drawing/settings-panel.test.ts`

Expected: FAIL until `DesignSetter.vue` is migrated.

- [ ] **Step 3: Migrate the template and imports**

Replace `<ASegmented ... />` with `<BSegmented ... />` and remove `Segmented as ASegmented` from the Ant Design import. Do not modify `ModelList.vue`.

- [ ] **Step 4: Run the drawing test to verify it passes**

Run: `pnpm test test/views/drawing/settings-panel.test.ts`

Expected: PASS.

### Task 4: Changelog And Verification

**Files:**
- Modify: `changelog/2026-06-25.md`

- [ ] **Step 1: Add changelog entry**

Add one `Changed` entry noting that `BSegmented` was added and the drawing text alignment control now uses it.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BSegmented/index.test.ts
pnpm test test/views/drawing/settings-panel.test.ts
```

Expected: both commands PASS.

- [ ] **Step 3: Run project checks**

Run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```

Expected: all commands complete successfully, or any pre-existing unrelated failures are recorded clearly.
