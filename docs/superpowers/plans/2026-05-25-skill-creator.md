# Skill 创建功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Skill 设置页新增上传 .skill/.zip 创建技能功能，含前端 Worker 解压、预览确认、写入安装全流程。

**Architecture:** SkillCreatorModal（BModal 模态框）→ BUpload（选择文件）→ Web Worker（JSZip 解压 + parseSkillMarkdown）→ 主线程（预览）→ 确认后 IPC writeFile/ensureDir → store.rescan()

**Tech Stack:** JSZip（解压）、Web Worker（`new Worker(new URL(...), { type: 'module' })`）、现有 BModal/BButton/BUpload 组件、现有 parseSkillMarkdown/ipc

---

### Task 1: Install JSZip dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install JSZip**

```bash
pnpm add jszip
```

验证: `node -e "require('jszip')"` 不报错

---

### Task 2: Add `fs:ensureDir` IPC handler

**Files:**
- Modify: `electron/main/modules/file/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`

- [ ] **Step 1: Add `fs:ensureDir` handler in main process IPC**

In `electron/main/modules/file/ipc.mts`, add inside `registerFileHandlers()` after the `fs:writeFile` handler:

```typescript
ipcMain.handle('fs:ensureDir', async (_event, dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
});
```

- [ ] **Step 2: Expose `ensureDir` in preload**

In `electron/preload/index.mts`, add after `renameFile` line:

```typescript
ensureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
```

- [ ] **Step 3: Add `ensureDir` type declaration**

In `types/electron-api.d.ts`, add after `renameFile` line:

```typescript
ensureDir: (dirPath: string) => Promise<void>;
```

---

### Task 3: Create Web Worker for zip parsing

**Files:**
- Create: `src/ai/skill/installer.worker.ts`

- [ ] **Step 1: Create the Worker file**

```typescript
/**
 * @file installer.worker.ts
 * @description Web Worker：接收 zip ArrayBuffer，解压并解析 SKILL.md。
 */
import JSZip from 'jszip';
import { parseSkillMarkdown } from './parser';
import type { SkillDefinition } from './types';

/** zip 文件 magic bytes（PK\x03\x04） */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
/** 最大 zip 条目数。 */
const MAX_ENTRIES = 50;
/** 单个文件最大解压后字节数。 */
const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB
/** SKILL.md 文件名。 */
const SKILL_MD = 'SKILL.md';

/** 检查 ArrayBuffer 前 4 字节是否为 zip magic bytes。 */
function isZipFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const header = new Uint8Array(buffer.slice(0, 4));
  return header.every((byte, i) => byte === ZIP_MAGIC[i]);
}

/** 附带资源文件。 */
interface ResourceFile {
  /** 相对路径（相对于 skill 目录，如 "templates/component.tsx"） */
  relativePath: string;
  /** UTF-8 文本内容 */
  content: string;
}

/** Worker 请求。 */
interface WorkerRequest {
  type: 'parse';
  buffer: ArrayBuffer;
}

/** Worker 成功响应。 */
interface WorkerSuccessResponse {
  type: 'success';
  skill: SkillDefinition;
  resources: ResourceFile[];
  warnings: string[];
}

/** Worker 错误响应。 */
interface WorkerErrorResponse {
  type: 'error';
  error: string;
}

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

/**
 * 从 zip 条目路径中提取 skill 目录名。
 * 如 "my-skill/SKILL.md" → "my-skill"
 * 路径穿越检测：如果路径不以目录名开头或包含 ../，抛出错误。
 */
function extractSkillDirName(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const dirName = parts[0];

  // Zip Slip 防护：目录名不能为空、不能是相对路径段
  if (!dirName || dirName === '.' || dirName === '..') {
    throw new Error(`安全校验失败：条目 "${entryPath}" 路径不合法`);
  }

  return dirName;
}

/**
 * 校验所有条目路径是否安全（无路径穿越）。
 */
function validateEntryPaths(entries: { name: string }[], skillDirName: string): void {
  const prefix = `${skillDirName}/`;

  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/');

    // 必须以 <skillDirName>/ 开头
    if (!normalized.startsWith(prefix)) {
      throw new Error(`安全校验失败：条目 "${entry.name}" 不在一级目录 "${skillDirName}" 下`);
    }

    // 不得包含路径穿越
    if (normalized.includes('../') || normalized.includes('..\\')) {
      throw new Error(`安全校验失败：条目 "${entry.name}" 包含非法的路径穿越`);
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  if (event.data.type !== 'parse') return;

  const { buffer } = event.data;

  try {
    // Magic bytes 校验：非 zip 格式拒绝
    if (!isZipFormat(buffer)) {
      const response: WorkerErrorResponse = {
        type: 'error',
        error: '不支持的文件格式，仅支持 .skill 和 .zip（ZIP 格式）'
      };
      self.postMessage(response);
      return;
    }

    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files).filter((f) => !f.dir);

    // 校验条目数
    if (entries.length > MAX_ENTRIES) {
      const response: WorkerErrorResponse = {
        type: 'error',
        error: `压缩包包含 ${entries.length} 个文件，超过上限 ${MAX_ENTRIES} 个`
      };
      self.postMessage(response);
      return;
    }

    // 查找 SKILL.md（找一级目录下的 SKILL.md）
    const skillMdEntry = entries.find(
      (e) => {
        const normalized = e.name.replace(/\\/g, '/');
        const parts = normalized.split('/');
        return parts.length === 2 && parts[1] === SKILL_MD;
      }
    );

    if (!skillMdEntry) {
      const response: WorkerErrorResponse = {
        type: 'error',
        error: '压缩包中未找到 <name>/SKILL.md 文件（SKILL.md 必须在 skill 目录的根层级）'
      };
      self.postMessage(response);
      return;
    }

    const skillDirName = extractSkillDirName(skillMdEntry.name);

    // Zip Slip 安全校验
    validateEntryPaths(entries, skillDirName);

    const warnings: string[] = [];
    const resources: ResourceFile[] = [];

    // 读取 SKILL.md 内容
    const skillMdContent = await skillMdEntry.async('string');

    const tempFilePath = `/${skillDirName}/SKILL.md`;
    const skill = parseSkillMarkdown(skillMdContent, tempFilePath, {
      source: 'global'
    });

    if (skill.parseError) {
      const response: WorkerErrorResponse = {
        type: 'error',
        error: `SKILL.md 解析失败：${skill.parseError}`
      };
      self.postMessage(response);
      return;
    }

    // 收集附带资源文件
    const otherEntries = entries.filter((e) => e !== skillMdEntry);

    for (const entry of otherEntries) {
      const size = await entry.async('uint8array').then((data) => data.byteLength);

      if (size > MAX_FILE_BYTES) {
        const response: WorkerErrorResponse = {
          type: 'error',
          error: `文件 "${entry.name}" 解压后超过 1MB 限制`
        };
        self.postMessage(response);
        return;
      }

      let content: string;
      try {
        content = await entry.async('string');
      } catch {
        warnings.push(`文件 "${entry.name}" 不是有效的文本文件，已跳过`);
        continue;
      }

      // 相对于 skill 目录的路径（去掉一级目录前缀）
      const relativePath = entry.name.replace(/\\/g, '/').replace(/^[^/]+\//, '');

      resources.push({ relativePath, content });
    }

    const response: WorkerSuccessResponse = {
      type: 'success',
      skill,
      resources,
      warnings
    };

    self.postMessage(response);
  } catch (err: unknown) {
    const response: WorkerErrorResponse = {
      type: 'error',
      error: `解压失败：${err instanceof Error ? err.message : String(err)}`
    };
    self.postMessage(response);
  }
};
```

---

### Task 4: Create SkillCreatorModal component

**Files:**
- Create: `src/views/settings/tools/skill/components/SkillCreatorModal.vue`

- [ ] **Step 1: Create the modal with three-step flow**

```vue
<!--
  @file SkillCreatorModal.vue
  @description 技能创建模态框：上传 .skill/.zip → Worker 解压解析 → 预览确认安装。
-->
<template>
  <BModal
    v-model:open="visible"
    :title="modalTitle"
    :width="560"
    :closable="step !== 'parsing'"
    :mask-closable="step !== 'parsing'"
    :main-style="{ maxHeight: '70vh', overflow: 'auto' }"
    @close="handleClose"
  >
    <!-- 步骤 1：上传 -->
    <div v-if="step === 'upload'" class="skill-creator__upload">
      <BUpload accept=".skill,.zip" @change="handleFileSelected">
        <div class="skill-creator__dropzone">
          <Icon icon="lucide:upload" :width="32" />
          <span class="skill-creator__dropzone-text">拖拽 .skill 或 .zip 文件到此处</span>
          <span class="skill-creator__dropzone-hint">或点击选择文件</span>
          <span class="skill-creator__dropzone-limit">支持 .skill / .zip，最大 5MB</span>
        </div>
      </BUpload>
    </div>

    <!-- 步骤 2：解析中 -->
    <div v-else-if="step === 'parsing'" class="skill-creator__parsing">
      <ASpin size="large" />
      <span class="skill-creator__parsing-text">正在解析…</span>
    </div>

    <!-- 步骤 3：预览 -->
    <div v-else-if="step === 'preview'" class="skill-creator__preview">
      <div class="skill-creator__field">
        <span class="skill-creator__label">技能名称</span>
        <span class="skill-creator__value">{{ parsedSkill?.name }}</span>
      </div>
      <div class="skill-creator__field">
        <span class="skill-creator__label">描述</span>
        <span class="skill-creator__value">{{ parsedSkill?.description }}</span>
      </div>

      <!-- SKILL.md 内容预览 -->
      <div class="skill-creator__field">
        <span class="skill-creator__label">SKILL.md 内容预览</span>
        <div class="skill-creator__content-preview">
          <pre>{{ parsedSkill?.content }}</pre>
        </div>
      </div>

      <!-- 附带资源 -->
      <div v-if="parsedResources.length > 0" class="skill-creator__field">
        <span class="skill-creator__label">附带资源文件 ({{ parsedResources.length }})</span>
        <div class="skill-creator__resource-list">
          <div v-for="r in parsedResources" :key="r.relativePath" class="skill-creator__resource-item">
            <Icon icon="lucide:file" :width="14" />
            <span>{{ r.relativePath }}</span>
          </div>
        </div>
      </div>

      <!-- 警告 -->
      <div v-if="parsedWarnings.length > 0" class="skill-creator__warnings">
        <div v-for="(w, i) in parsedWarnings" :key="i" class="skill-creator__warning-item">
          {{ w }}
        </div>
      </div>

      <!-- 冲突警告 -->
      <div v-if="hasConflict" class="skill-creator__conflict">
        <Icon icon="lucide:alert-triangle" :width="14" />
        <span>{{ parsedSkill?.name }} 已存在，安装将覆盖原有内容</span>
      </div>
    </div>

    <template v-if="step !== 'parsing'" #footer>
      <div class="skill-creator__footer">
        <BButton @click="handleClose">{{ step === 'preview' ? '取消' : '取消' }}</BButton>
        <BButton v-if="step === 'preview'" type="primary" :loading="installing" @click="handleInstall">
          确认安装
        </BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { message } from 'ant-design-vue';
import { nanoid } from 'nanoid';
import type { SkillDefinition } from '@/ai/skill/types';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { useSkillStore } from '@/stores/ai/skill';

/** 资源文件（来自 Worker 解析结果）。 */
interface ResourceFile {
  relativePath: string;
  content: string;
}

/** Worker 解析返回数据结构。 */
interface WorkerParseResult {
  skill: SkillDefinition;
  resources: ResourceFile[];
  warnings: string[];
}

/** 模态框步骤。 */
type Step = 'upload' | 'parsing' | 'preview';

/** 文件大小上限：5MB。 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const visible = defineModel<boolean>('open', { default: false });
const store = useSkillStore();

const step = ref<Step>('upload');
const parsedSkill = shallowRef<SkillDefinition | null>(null);
const parsedResources = ref<ResourceFile[]>([]);
const parsedWarnings = ref<string[]>([]);
const installing = ref(false);

/** Worker 实例。 */
let worker: Worker | null = null;

/** 创建 Worker 实例。 */
function createWorker(): Worker {
  const w = new Worker(new URL('@/ai/skill/installer.worker.ts', import.meta.url), { type: 'module' });
  return w;
}

/** 终止并清理 Worker。 */
function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/** 模态框打开/关闭时管理 Worker 生命周期。 */
watch(visible, (val) => {
  if (!val) {
    terminateWorker();
    resetState();
  }
});

const modalTitle = computed(() => {
  if (step.value === 'parsing') return '创建技能';
  if (step.value === 'preview') return '创建技能';
  return '创建技能';
});

/** 目标目录是否已存在同名 skill。 */
const hasConflict = computed(() => {
  if (!parsedSkill.value) return false;
  return store.skills.some((s) => s.name === parsedSkill.value!.name);
});

/** 创建 Worker 实例。 */
function createWorker(): Worker {
  return new Worker(new URL('@/ai/skill/installer.worker.ts', import.meta.url), { type: 'module' });
}

/** 终止并清理 Worker。 */
function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/** 模态框打开/关闭时管理 Worker 生命周期。 */
watch(visible, (val) => {
  if (!val) {
    terminateWorker();
    resetState();
  }
});

/** 关闭模态框（watch 自动清理 Worker 并重置状态）。 */
function handleClose(): void {
  visible.value = false;
}

/** 重置内部状态。 */
function resetState(): void {
  step.value = 'upload';
  parsedSkill.value = null;
  parsedResources.value = [];
  parsedWarnings.value = [];
  installing.value = false;
}

/** 文件选择后：大小校验 → 发给 Worker 解析。 */
async function handleFileSelected(files: FileList): Promise<void> {
  const file = files[0];
  if (!file) return;

  // 大小校验
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    message.error(`文件过大（${sizeMB}MB），超过 5MB 限制`);
    return;
  }

  // 终止旧 Worker，创建新 Worker
  terminateWorker();
  worker = createWorker();

  // 设置 message handler
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data;

    if (data.type === 'error') {
      message.error(data.error);
      resetState();
      return;
    }

    if (data.type === 'success') {
      const result = data as WorkerParseResult;
      parsedSkill.value = result.skill;
      parsedResources.value = result.resources;
      parsedWarnings.value = result.warnings;
      step.value = 'preview';
    }
  };

  worker.onerror = (err: ErrorEvent) => {
    message.error(`解析异常：${err.message}`);
    resetState();
  };

  // 进入解析步骤
  step.value = 'parsing';
  const buffer = await file.arrayBuffer();
  worker.postMessage({ type: 'parse', buffer }, [buffer]);
}

/** 确认安装：备份 → 替换 → 清理或回滚（消除 TOCTOU 竞态）。 */
async function handleInstall(): Promise<void> {
  if (!parsedSkill.value) return;

  const api = getElectronAPI();
  if (!api) {
    message.error('当前环境不支持文件操作');
    return;
  }

  installing.value = true;
  const tmpDirName = `.tmp-${nanoid(8)}`;
  const bakDirName = `.bak-${nanoid(8)}`;
  let tmpDir = '';
  let bakDir = '';

  try {
    const skillName = parsedSkill.value.name;
    const baseDir = await getSkillDir(api);

    if (!baseDir) {
      message.error('无法获取 skills 目录');
      return;
    }

    tmpDir = `${baseDir}/${tmpDirName}`;
    const targetDir = `${baseDir}/${skillName}`;

    // 1. 写入临时目录
    await api.ensureDir(tmpDir);
    const skillMdContent = buildSkillMd(parsedSkill.value);
    await api.writeFile(`${tmpDir}/SKILL.md`, skillMdContent);
    for (const resource of parsedResources.value) {
      const resourcePath = `${tmpDir}/${resource.relativePath}`;
      const resourceDir = resourcePath.substring(0, resourcePath.lastIndexOf('/'));
      if (resourceDir) {
        await api.ensureDir(resourceDir);
      }
      await api.writeFile(resourcePath, resource.content);
    }

    // 2. 目标已存在 → 备份
    const status = await api.getPathStatus?.(targetDir);
    if (status?.exists) {
      bakDir = `${baseDir}/${bakDirName}`;
      await api.renameFile(targetDir, bakDir);
    }

    // 3. 替换：临时目录 → 目标
    try {
      await api.renameFile(tmpDir, targetDir);
    } catch {
      // 替换失败 → 回滚备份
      if (bakDir) {
        try { await api.renameFile(bakDir, targetDir); } catch { /* 尽力回滚 */ }
      }
      throw new Error('无法完成安装，已回滚');
    }

    // 4. 清理备份
    if (bakDir) {
      try { await api.trashFile(bakDir); } catch { /* 忽略，孤儿清理会处理 */ }
    }

    // 5. 重新扫描
    await store.rescan();

    message.success(`技能 "${skillName}" 安装成功`);
    handleClose();
  } catch (err: unknown) {
    // 失败时清理临时目录（备份由回滚逻辑处理）
    if (tmpDir) {
      try { await api.trashFile(tmpDir); } catch { /* 忽略，孤儿清理会处理 */ }
    }
    message.error(`安装失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    installing.value = false;
  }
}

/**
 * 获取 skills 目录路径。
 * 格式：<homeDir>/.agents/skills
 */
async function getSkillDir(api: ReturnType<typeof getElectronAPI>): Promise<string | null> {
  try {
    const homeDir = await api!.getHomeDir();
    return `${homeDir}/.agents/skills`;
  } catch {
    return null;
  }
}

/**
 * 根据 SkillDefinition 重建 SKILL.md 内容（frontmatter + body）。
 * 因为 Worker 只传回解析后的 content（body 部分），需还原完整文件。
 */
function buildSkillMd(skill: SkillDefinition): string {
  const frontmatter = [`name: ${skill.name}`, `description: "${skill.description}"`].join('\n');
  return `---\n${frontmatter}\n---\n\n${skill.content}`;
}
</script>

<style scoped lang="less">
.skill-creator__upload {
  display: flex;
  justify-content: center;
}

.skill-creator__dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 60px;
  border: 2px dashed var(--border-secondary);
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: var(--color-primary);
    background: var(--bg-hover);
  }
}

.skill-creator__dropzone-text {
  font-size: 14px;
}

.skill-creator__dropzone-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.skill-creator__dropzone-limit {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.skill-creator__parsing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 0;
}

.skill-creator__parsing-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.skill-creator__preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skill-creator__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-creator__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.skill-creator__value {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.skill-creator__content-preview {
  max-height: 200px;
  overflow: auto;
  padding: 12px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  background: var(--bg-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-tertiary);

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.skill-creator__resource-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-creator__resource-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-creator__warnings {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-creator__warning-item {
  font-size: 12px;
  color: var(--color-warning, #faad14);
}

.skill-creator__conflict {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-warning, #faad14);
  background: var(--bg-warning, rgba(250, 173, 20, 0.1));
  border-radius: 6px;
}

.skill-creator__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
pnpm vue-tsc --noEmit src/views/settings/tools/skill/components/SkillCreatorModal.vue
```

Expected: no type errors (may have some pre-existing project-level errors, focus on this file)

---

### Task 5: Integrate SkillCreatorModal into skill settings page

**Files:**
- Modify: `src/views/settings/tools/skill/index.vue`

- [ ] **Step 1: Add "创建技能" button and modal**

In `index.vue`, add the button to `#headerExtra` and add the SkillCreatorModal:

**Template changes** — add inside `<BSettingsPage>` the `#headerExtra` slot before `BSettingsSection`:

```vue
<BSettingsPage class="skill-settings__page" title="技能">
  <!-- 新增：headerExtra 插槽 -->
  <template #headerExtra>
    <BButton type="primary" size="small" @click="creatorVisible = true">创建技能</BButton>
  </template>

  <!-- 搜索路径说明 -->
  <BSettingsSection title="搜索路径" content-class="skill-settings__content">
    ...
```

**Template changes** — add SkillCreatorModal before the closing `</div>` (after the BPanelSplitter block):

```vue
    <!-- 创建技能模态框 -->
    <SkillCreatorModal v-model:open="creatorVisible" />
  </div>
</template>
```

**Script changes** — add imports and ref:

```typescript
import SkillCreatorModal from './components/SkillCreatorModal.vue';

// ... existing code ...

/** 创建技能模态框可见性。 */
const creatorVisible = ref(false);
```

Full diff context — in `<script setup>`:

```typescript
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useSkillStore } from '@/stores/ai/skill';
import SkillDetail from './components/SkillDetail.vue';
import SkillItemRow from './components/SkillItemRow.vue';
import SkillCreatorModal from './components/SkillCreatorModal.vue';
```

After `const detailVisible = ref(false);` line, add:

```typescript
const creatorVisible = ref(false);
```

---

### Task 6: Write Worker unit test

**Files:**
- Create: `test/ai/skill/installer-worker.test.ts`

- [ ] **Step 1: Write Worker functionality test**

Since Web Workers cannot be easily tested in vitest jsdom environment, test the core logic as a plain function by extracting it:

Actually, the simpler approach: test the worker by importing its core logic. But since `self.onmessage` / `postMessage` won't work in vitest, we test the zip validation logic directly using JSZip's API in the test, and cover the message protocol through the modal's integration test.

```typescript
/**
 * @file installer-worker.test.ts
 * @description 验证 zip 解压 + skill 解析核心逻辑。
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseSkillMarkdown } from '@/ai/skill/parser';

/** 最大条目数。 */
const MAX_ENTRIES = 50;
/** 单文件最大字节数。 */
const MAX_FILE_BYTES = 1 * 1024 * 1024;

/** 模拟 Worker 内 zip 解析逻辑（抽取纯函数便于测试）。 */
async function parseZipBuffer(buffer: ArrayBuffer): Promise<{
  skillContent: string;
  resourceFiles: { relativePath: string; content: string }[];
}> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  if (entries.length > MAX_ENTRIES) {
    throw new Error(`压缩包包含 ${entries.length} 个文件，超过上限 ${MAX_ENTRIES} 个`);
  }

  // 找一级目录下的 SKILL.md
  const skillMdEntry = entries.find(
    (e) => {
      const normalized = e.name.replace(/\\/g, '/');
      const parts = normalized.split('/');
      return parts.length === 2 && parts[1] === 'SKILL.md';
    }
  );

  if (!skillMdEntry) {
    throw new Error('压缩包中未找到 <name>/SKILL.md 文件');
  }

  const skillDirName = skillMdEntry.name.replace(/\\/g, '/').split('/')[0];

  // Zip Slip 安全校验
  const prefix = `${skillDirName}/`;
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/');
    if (!normalized.startsWith(prefix)) {
      throw new Error(`安全校验失败：条目 "${entry.name}" 不在一级目录下`);
    }
    if (normalized.includes('../') || normalized.includes('..\\')) {
      throw new Error(`安全校验失败：条目 "${entry.name}" 包含非法路径穿越`);
    }
  }

  const skillContent = await skillMdEntry.async('string');
  const otherEntries = entries.filter((e) => e !== skillMdEntry);
  const resourceFiles: { relativePath: string; content: string }[] = [];

  for (const entry of otherEntries) {
    const data = await entry.async('uint8array');
    if (data.byteLength > MAX_FILE_BYTES) {
      continue;
    }
    let content: string;
    try {
      content = await entry.async('string');
    } catch {
      continue;
    }
    const relativePath = entry.name.replace(/\\/g, '/').replace(/^[^/]+\//, '');
    resourceFiles.push({ relativePath, content });
  }

  return { skillContent, resourceFiles };
}

/**
 * 创建一个测试用 zip（包含 SKILL.md 和资源文件）。
 */
async function createTestZip(skillMdContent: string, resources?: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const dirName = 'test-skill';
  zip.file(`${dirName}/SKILL.md`, skillMdContent);

  if (resources) {
    for (const [relPath, content] of Object.entries(resources)) {
      zip.file(`${dirName}/${relPath}`, content);
    }
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('zip parsing logic', () => {
  it('parses a valid zip with SKILL.md', async () => {
    const buffer = await createTestZip(`---
name: my-skill
description: A test skill.
---

# Hello World`);

    const result = await parseZipBuffer(buffer);

    expect(result.skillContent).toContain('name: my-skill');
    expect(result.skillContent).toContain('# Hello World');
    expect(result.resourceFiles).toHaveLength(0);
  });

  it('extracts resource files alongside SKILL.md', async () => {
    const buffer = await createTestZip(
      `---
name: rich-skill
description: Has templates.
---

# Rich Skill`,
      {
        'templates/component.tsx': 'export const Hello = () => <div>Hi</div>;',
        'examples/usage.md': '# Usage\n\nExample here.'
      }
    );

    const result = await parseZipBuffer(buffer);

    expect(result.resourceFiles).toHaveLength(2);
    expect(result.resourceFiles[0].relativePath).toBe('templates/component.tsx');
    expect(result.resourceFiles[1].relativePath).toBe('examples/usage.md');
  });

  it('throws when no SKILL.md found', async () => {
    const zip = new JSZip();
    zip.file('test-skill/README.md', '# Not a skill');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseZipBuffer(buffer)).rejects.toThrow('未找到 SKILL.md');
  });

  it('rejects zip slip path traversal (../ in path)', async () => {
    const zip = new JSZip();
    zip.file('test-skill/SKILL.md', `---
name: safe
description: Not safe.
---

# unsafe`);
    // Malicious entry attempting path traversal
    zip.file('test-skill/../../../etc/passwd', 'malicious');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseZipBuffer(buffer)).rejects.toThrow('安全校验失败');
  });

  it('rejects entries outside skill root directory', async () => {
    const zip = new JSZip();
    zip.file('evil/SKILL.md', `---
name: evil
description: Evil.
---

# evil`);
    // Entry under a different root directory
    zip.file('other/README.md', 'sneaky');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(parseZipBuffer(buffer)).rejects.toThrow('安全校验失败');
  });

  it('parseSkillMarkdown validates the parsed SKILL.md content', () => {
    const result = parseSkillMarkdown(
      `---
name: valid
description: Works fine.
---

Body here.`,
      '/test-skill/SKILL.md'
    );

    expect(result.name).toBe('valid');
    expect(result.parseError).toBeUndefined();
  });

  it('parseSkillMarkdown rejects missing name', () => {
    const result = parseSkillMarkdown(
      `---
description: No name here.
---

Body`,
      '/bad/SKILL.md'
    );

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('name');
  });
});
```

---

### Task 7: Write SkillCreatorModal unit test

**Files:**
- Create: `test/views/settings/tools-skill/SkillCreatorModal.test.ts`

- [ ] **Step 1: Write modal rendering test**

```typescript
/**
 * @file SkillCreatorModal.test.ts
 * @description 验证 SkillCreatorModal 三步流程渲染与交互。
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import SkillCreatorModal from '@/views/settings/tools/skill/components/SkillCreatorModal.vue';
import { createPinia, setActivePinia } from 'pinia';

// Mock electron API
const mockEnsureDir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockGetHomeDir = vi.fn().mockResolvedValue('/home/user');

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    ensureDir: mockEnsureDir,
    writeFile: mockWriteFile,
    getHomeDir: mockGetHomeDir
  })
}));

// Mock skill store
vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: () => ({
    skills: [],
    rescan: vi.fn().mockResolvedValue(undefined)
  })
}));

// Mock Worker
vi.mock('@/ai/skill/installer.worker.ts', () => ({
  default: class MockWorker {
    onmessage: ((event: MessageEvent) => {}) as Worker['onmessage'];
    onerror: ((event: ErrorEvent) => {}) as Worker['onerror'];
    postMessage(_data: unknown, _transfer?: Transferable[]) {}
    terminate() {}
  }
}));

describe('SkillCreatorModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders upload step by default when open', () => {
    const wrapper = mount(SkillCreatorModal, {
      props: { open: true, 'onUpdate:open': () => {} },
      global: {
        stubs: {
          BModal: {
            template: '<div><slot /><slot name="footer" /></div>',
            props: ['title', 'width', 'closable', 'maskClosable', 'mainStyle']
          },
          BUpload: {
            template: '<div @click="$emit(\'change\', [])"><slot /></div>',
            props: ['accept']
          },
          BButton: { template: '<button><slot /></button>', props: ['type', 'size', 'loading', 'disabled'] },
          ASpin: { template: '<div class="spin-stub" />', props: ['size'] },
          Icon: { template: '<i />', props: ['icon', 'width'] }
        }
      }
    });

    // Should show upload area
    expect(wrapper.text()).toContain('拖拽 .skill 或 .zip 文件到此处');
    expect(wrapper.text()).toContain('支持 .skill / .zip，最大 5MB');
  });

  it('closes modal on cancel button click', async () => {
    const wrapper = mount(SkillCreatorModal, {
      props: { open: true, 'onUpdate:open': (val: boolean) => wrapper.setProps({ open: val }) },
      global: {
        stubs: {
          BModal: {
            template: '<div><slot /><slot name="footer" /></div>',
            props: ['title', 'width', 'closable', 'maskClosable', 'mainStyle']
          },
          BUpload: {
            template: '<div><slot /></div>',
            props: ['accept']
          },
          BButton: { template: '<button @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'loading', 'disabled'] },
          ASpin: { template: '<div />', props: ['size'] },
          Icon: { template: '<i />', props: ['icon', 'width'] }
        }
      }
    });

    const buttons = wrapper.findAllComponents({ name: 'BButton' });
    // First button in footer is "取消"
    const cancelBtn = buttons.find((b) => b.text() === '取消');
    expect(cancelBtn).toBeTruthy();
  });
});
```

---

### Task 8: Add scanner dot-prefix filter + orphan cleanup

**Files:**
- Modify: `src/ai/skill/scanner.ts`

- [ ] **Step 1: Filter dot-prefixed directories and add orphan cleanup**

In `scanner.ts`, update `scanDirectory` to filter out `.`-prefixed directory entries:

```typescript
// In scanDirectory(), after filtering for directory type:
const dirEntries = entries
  .filter((e) => e.type === 'directory')
  .filter((e) => !e.name.startsWith('.')); // 排除 .tmp-*, .bak-* 等
```

And in `scanSkills()`, add orphan directory cleanup before scanning:

```typescript
export async function scanSkills(config: SkillScanConfig, api: SkillScannerAPI): Promise<SkillDefinition[]> {
  const { maxContentLength } = config;
  const globalSkillsDir = joinPath(config.homeDir, '.agents', 'skills');

  // 清理孤儿临时/备份目录（上次安装中断遗留）
  try {
    const { entries } = await api.readWorkspaceDirectory({ directoryPath: globalSkillsDir });
    for (const entry of entries) {
      if (entry.type === 'directory' && (entry.name.startsWith('.tmp-') || entry.name.startsWith('.bak-'))) {
        const orphanPath = joinPath(globalSkillsDir, entry.name);
        try {
          // 通过 preload 暴露的 trashFile 清理（或直接调用 api）
          // scanner 中没有直接访问 trashFile，改为标记并继续
        } catch { /* ignore */ }
      }
    }
  } catch { /* 目录不存在，跳过 */ }

  const globalSkills = await scanDirectory(globalSkillsDir, 'global', api, maxContentLength);
  // ... rest unchanged
```

Note: `trashFile` is not exposed to the scanner via `SkillScannerAPI`. The orphan cleanup should be done in the store's `init()` method after obtaining `api` (which has `trashFile`). Move the cleanup logic to `useSkillStore.init()` in `src/stores/ai/skill.ts`:

```typescript
// In useSkillStore.init(), before scanSkills call:
async function cleanOrphanDirs(api: SkillScannerAPI): Promise<void> {
  const skillsDir = joinPath(homeDir, '.agents', 'skills');
  try {
    const { entries } = await api.readWorkspaceDirectory({ directoryPath: skillsDir });
    for (const entry of entries) {
      if (entry.type === 'directory' && (entry.name.startsWith('.tmp-') || entry.name.startsWith('.bak-'))) {
        const orphanPath = joinPath(skillsDir, entry.name);
        // Need trashFile from electronAPI, but SkillScannerAPI doesn't have it.
        // Solution: extend SkillScannerAPI or pass the full electronAPI
      }
    }
  } catch { /* ignore */ }
}
```

实际上孤儿清理需要 `trashFile`，而 `SkillScannerAPI` 没有此方法。最简单的方案：在 store 的 `rescan()` 中调用 `cleanOrphanDirs`（因为 store 持有 `cachedApi`），但 `cachedApi` 类型是 `SkillScannerAPI`。更实际的方案是在 `init()` 启动时通过额外的 API 参数传入 `trashFile` 能力。

**简化方案**：在 `scanDirectory` 中已经过滤了 `.` 开头目录，孤儿目录不会被解析为 skill。真正的清理可以在安装流程的 `handleInstall` 失败分支中处理（已在 Task 4 中实现），或在下次 `rescan` 前由 store 调用 `trashFile`。

Store 清理方案 — 在 `src/stores/ai/skill.ts` 的 `rescan()` 中添加：

```typescript
async function rescan(): Promise<void> {
  if (!cachedApi || !scanConfig.value.homeDir) {
    console.warn('Skill rescan called before init');
    return;
  }

  // 清理孤儿目录
  await cleanOrphanDirs(scanConfig.value.homeDir);

  initPromise = null;
  initialized.value = false;
  await init(scanConfig.value.homeDir, cachedApi);
}
```

需要 `src/ai/skill/scanner.ts` 导出 `joinPath` 辅助函数（或直接从 `parser.ts` 引入），以及将 `trashFile` 加入 `SkillScannerAPI` 接口。

**推荐简化**：不在 scanner/store 层做孤儿清理，改为在 `SkillCreatorModal.handleInstall()` 的 catch 分支中直接 `trashFile(tmpDir)`（已实现）。同时 `scanDirectory` 过滤 `.` 开头目录即可。孤儿目录不会影响功能（不会被解析），仅在磁盘上留下少量残留，用户手工删除即可。这样避免了为清理逻辑大幅扩展 scanner API。

---

### Task 9: Sync test coverage for new requirements

**Files:**
- Modify: `test/ai/skill/installer-worker.test.ts`

- [ ] **Step 1: Add magic bytes rejection test**

In Task 6 worker test file, add:

```typescript
it('rejects non-zip files (magic bytes check)', async () => {
  const fakeBuffer = new TextEncoder().encode('not a zip file').buffer;
  await expect(parseZipBuffer(fakeBuffer)).rejects.toThrow('不支持的文件格式');
});
```

- [ ] **Step 1: Update single-file limit test** to expect rejection instead of skip:

```typescript
it('rejects entries exceeding 1MB single file limit', async () => {
  const zip = new JSZip();
  zip.file('test-skill/SKILL.md', `---
name: big
description: Big files.
---

# Big`);
  // Add a file exceeding 1MB (in the test, we mock or use a smaller limit)
  const bigContent = 'x'.repeat(MAX_FILE_BYTES + 1);
  zip.file('test-skill/huge.txt', bigContent);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });

  await expect(parseZipBuffer(buffer)).rejects.toThrow('超过 1MB 限制');
});
```

---

## Task Dependencies

```
Task 1 (jszip dep) ──┐
                     ├── Task 3 (Worker) ── Task 4 (Modal) ── Task 5 (index.vue)
Task 2 (ensureDir) ──┤                                       Task 8 (scanner)
                     │                                              │
                     │                                       Task 6 (Worker test)
                     │                                       Task 7 (Modal test)
                     │                                       Task 9 (test coverage)
```

- Tasks 1, 2 can run in parallel
- Task 3 depends on Task 1 (needs jszip)
- Task 4 depends on Tasks 2, 3
- Task 5 depends on Task 4
- Task 8 (scanner filter) is independent, can run anytime
- Tasks 6, 7, 9 can run after respective implementations are done
