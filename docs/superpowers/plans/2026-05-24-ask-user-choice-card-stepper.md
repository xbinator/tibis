# AskUserChoiceCard 步骤条改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AskUserChoiceCard 从单卡片改造为两步步骤条形式

**Architecture:** 使用 ant-design-vue 的 a-steps 组件，通过 currentStep 状态控制步骤切换，第一步展示选项，第二步展示补充信息输入框

**Tech Stack:** Vue 3 Composition API, ant-design-vue Steps 组件, Less

---

### Task 1: 改造 AskUserChoiceCard 组件

**Files:**
- Modify: `src/components/BChatSidebar/components/AskUserChoiceCard.vue`

- [ ] **Step 1: 添加 currentStep 状态和步骤配置**

在 script setup 中添加：

```typescript
const currentStep = ref(0);

const stepItems = [
  { title: '选择答案' },
  { title: '补充信息' }
];
```

- [ ] **Step 2: 添加步骤切换函数**

添加以下函数：

```typescript
/**
 * 进入下一步
 */
function handleNext(): void {
  if (!canSubmit.value) {
    return;
  }
  currentStep.value = 1;
}

/**
 * 返回上一步
 */
function handlePrev(): void {
  currentStep.value = 0;
}
```

- [ ] **Step 3: 修改 handleSubmit 函数**

保持不变，仅在第二步点击"提交"时调用。

- [ ] **Step 4: 重构模板 - 添加步骤条和条件渲染**

将整个 template 替换为：

```vue
<template>
  <div class="choice-card">
    <a-steps :current="currentStep" :items="stepItems" size="small" />

    <!-- 第一步：选择答案 -->
    <div v-show="currentStep === 0" class="choice-card__step">
      <div class="choice-card__title">{{ question.question }}</div>

      <div class="choice-card__options">
        <label v-for="option in question.options" :key="option.value" class="choice-card__option">
          <div class="choice-card__option-input">
            <input
              :type="inputType"
              :value="option.value"
              :checked="selectedValues.includes(option.value)"
              :disabled="isOptionDisabled(option.value)"
              @change="handleOptionChange(option.value, ($event.target as HTMLInputElement).checked)"
            />
          </div>
          <span class="choice-card__option-main">
            <span>{{ option.label }}</span>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
        </label>
      </div>

      <div class="choice-card__footer">
        <BButton size="small" :disabled="!canSubmit" @click="handleNext">下一步</BButton>
      </div>
    </div>

    <!-- 第二步：补充信息 -->
    <div v-show="currentStep === 1" class="choice-card__step">
      <div class="choice-card__title">是否有更多的补充信息需要提供？（可选）</div>

      <input v-model="otherText" class="choice-card__other" type="text" placeholder="请输入补充信息..." />

      <div class="choice-card__footer">
        <BButton size="small" type="default" @click="handlePrev">上一步</BButton>
        <BButton size="small" @click="handleSubmit">提交</BButton>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 更新样式**

将 style 部分替换为：

```less
<style scoped lang="less">
.choice-card {
  padding: 12px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
}

.choice-card__step {
  margin-top: 12px;
}

.choice-card__title {
  margin-bottom: 10px;
  font-weight: 600;
}

.choice-card__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choice-card__option-input {
  display: flex;
  align-items: center;
  height: 20px;
}

.choice-card__option {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
}

.choice-card__option-main {
  display: flex;
  flex-direction: column;
  gap: 2px;

  small {
    color: var(--text-secondary);
  }
}

.choice-card__other {
  width: 100%;
  padding: 7px 9px;
  color: var(--text-primary);
  outline: none;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.choice-card__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>
```

- [ ] **Step 6: 验证组件功能**

启动开发服务器，测试以下场景：
1. 第一步必须选择至少一项才能点"下一步"
2. 第二步可以不填直接提交
3. 点击"上一步"返回第一步，选择状态保留
4. 单选/多选模式都正常工作
5. 多选上限限制正常工作

---

## 变更摘要

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/components/BChatSidebar/components/AskUserChoiceCard.vue` | 修改 | 改造为步骤条形式 |
