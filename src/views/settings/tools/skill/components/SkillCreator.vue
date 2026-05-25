<!--
  @file SkillCreatorModal.vue
  @description 技能创建模态框：上传 .skill/.zip → Worker 解压解析 → 预览确认安装。
-->
<template>
  <BModal
    v-model:open="visible"
    title="创建技能"
    :closable="step !== 'parsing'"
    :mask-closable="step !== 'parsing'"
    :main-style="{ maxHeight: '70vh', overflow: 'auto' }"
    @close="handleClose"
  >
    <!-- 步骤 1：上传 -->
    <div v-if="step === 'upload'" class="skill-creator__upload">
      <BUpload accept=".skill,.zip" @change="handleFileSelected">
        <div
          class="skill-creator__dropzone"
          :class="{ 'skill-creator__dropzone--active': dragOver }"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="handleDrop"
        >
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

      <!-- 截断警告 -->
      <div v-if="contentTruncated" class="skill-creator__truncation-warning">
        <Icon icon="lucide:alert-triangle" :width="14" />
        <span>SKILL.md 内容超过 10000 字符，已截断</span>
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

      <!-- 解析警告 -->
      <div v-if="parsedWarnings.length > 0" class="skill-creator__warnings">
        <div v-for="(w, i) in parsedWarnings" :key="i" class="skill-creator__warning-item">
          <Icon icon="lucide:alert-triangle" :width="14" />
          <span>{{ w }}</span>
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
        <BButton type="secondary" @click="handleClose">取消</BButton>
        <BButton v-if="step === 'preview'" type="primary" :loading="installing" @click="handleInstall"> 确认安装 </BButton>
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
  /** 编码方式，'base64' 表示二进制文件 */
  encoding?: 'base64';
}

/** Worker 解析返回数据结构。 */
interface WorkerParseResult {
  skill: SkillDefinition;
  /** 原始 SKILL.md 完整内容（含 frontmatter），安装时直接写入保留所有字段 */
  rawSkillMd: string;
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
const dragOver = ref(false);
/** 原始 SKILL.md 内容，安装时直接写入保留所有 frontmatter 字段。 */
const rawSkillMd = ref('');

/** Worker 实例。 */
let worker: Worker | null = null;

/** 内容是否被截断。 */
const contentTruncated = computed(() => {
  return parsedSkill.value?.truncated ?? false;
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

/** 重置内部状态。 */
function resetState(): void {
  step.value = 'upload';
  parsedSkill.value = null;
  parsedResources.value = [];
  parsedWarnings.value = [];
  rawSkillMd.value = '';
  installing.value = false;
  dragOver.value = false;
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
    const { data } = event;

    if (data.type === 'error') {
      message.error(data.error);
      resetState();
      return;
    }

    if (data.type === 'success') {
      const result = data as WorkerParseResult;
      parsedSkill.value = result.skill;
      rawSkillMd.value = result.rawSkillMd;
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

/** 处理拖拽放下文件。 */
function handleDrop(e: DragEvent): void {
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext !== 'skill' && ext !== 'zip') {
    message.error('仅支持 .skill 和 .zip 文件');
    return;
  }

  // 构造一个 FileList-like 对象传给 handleFileSelected
  const dt = new DataTransfer();
  dt.items.add(file);
  handleFileSelected(dt.files);
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
    await api.writeFile(`${tmpDir}/SKILL.md`, rawSkillMd.value);
    await Promise.all(
      parsedResources.value.map(async (resource) => {
        const resourcePath = `${tmpDir}/${resource.relativePath}`;
        const resourceDir = resourcePath.substring(0, resourcePath.lastIndexOf('/'));
        if (resourceDir) {
          await api.ensureDir(resourceDir);
        }
        await api.writeFile(resourcePath, resource.content);
      })
    );

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
        try {
          await api.renameFile(bakDir, targetDir);
        } catch {
          // 尽力回滚
        }
      }
      throw new Error('无法完成安装，已回滚');
    }

    // 4. 清理备份
    if (bakDir) {
      try {
        await api.trashFile(bakDir);
      } catch {
        // 忽略，孤儿清理会处理
      }
    }

    // 5. 重新扫描
    await store.rescan();

    message.success(`技能 "${skillName}" 安装成功`);
    handleClose();
  } catch (err: unknown) {
    // 失败时清理临时目录
    if (tmpDir) {
      try {
        await api.trashFile(tmpDir);
      } catch {
        // 忽略，孤儿清理会处理
      }
    }
    message.error(`安装失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    installing.value = false;
  }
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
  gap: 8px;
  align-items: center;
  padding: 40px 60px;
  color: var(--text-secondary);
  cursor: pointer;
  border: 2px dashed var(--border-secondary);
  border-radius: 8px;
  transition: border-color 0.2s, background 0.2s;

  &:hover,
  &--active {
    background: var(--bg-hover);
    border-color: var(--color-primary);
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
  gap: 16px;
  align-items: center;
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
}

.skill-creator__truncation-warning {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-warning, #faad14);
  background: var(--bg-warning, rgb(250 173 20 / 10%));
  border-radius: 6px;
}

.skill-creator__content-preview {
  max-height: 200px;
  padding: 12px;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-tertiary);
  border-radius: 6px;

  pre {
    margin: 0;
    white-space: pre-wrap;
  }
}

.skill-creator__resource-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-creator__resource-item {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-creator__warnings {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-creator__warning-item {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--color-warning, #faad14);
}

.skill-creator__conflict {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-warning, #faad14);
  background: var(--bg-warning, rgb(250 173 20 / 10%));
  border-radius: 6px;
}

.skill-creator__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
