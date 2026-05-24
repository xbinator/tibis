<!--
  @file SkillDetail.vue
  @description Skill 只读详情面板，展示 Skill 元信息、目录文件树与文件内容预览。
-->
<template>
  <BSettingsPage title="Skill 详情" class="skill-detail">
    <template #title>
      <div v-if="skill" class="skill-detail__title">
        <div class="skill-detail__icon">{{ initial }}</div>
        <div class="skill-detail__name">
          <div class="skill-detail__name-text">{{ skill.name }}</div>
          <span class="skill-detail__tag">{{ skill.enabled ? '已启用' : '已禁用' }}</span>
        </div>
      </div>
    </template>

    <template #headerExtra>
      <BButton type="text" square title="关闭详情" data-test="skill-detail-close" @click="emit('close')">
        <Icon icon="lucide:x" :width="16" />
      </BButton>
    </template>

    <template v-if="skill">
      <header class="skill-detail__header">
        <div class="skill-detail__meta">
          <div class="skill-detail__desc">{{ normalizedDescription }}</div>
        </div>
      </header>

      <div v-if="skill.parseError" class="skill-detail__parse-error">
        <Icon icon="lucide:alert-triangle" :width="14" />
        <span>{{ skill.parseError }}</span>
      </div>

      <div class="skill-detail__path">{{ skill.dirPath }}</div>

      <div class="skill-detail__body">
        <BPanelSplitter v-show="showFileTree" position="right" :size="220" :min-width="160" :max-width="300" :closable="false">
          <SkillFileTree :root-path="skill?.dirPath ?? ''" :selected-file-path="selectedFilePath" @select-file="handleSelectFile" @loaded="handleTreeLoaded" />
        </BPanelSplitter>

        <main class="skill-detail__preview">
          <div class="skill-detail__preview-header">
            <span>{{ selectedFileName }}</span>
          </div>

          <div v-if="fileLoading" class="skill-detail__preview-empty">正在读取文件…</div>
          <div v-else-if="fileError" class="skill-detail__preview-error">{{ fileError }}</div>
          <pre v-else class="skill-detail__preview-content"><code>{{ fileContent }}</code></pre>
        </main>
      </div>
    </template>
  </BSettingsPage>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import type { SkillDefinition } from '@/ai/skill/types';
import { native } from '@/shared/platform';
import SkillFileTree from './SkillFileTree.vue';

interface Props {
  /** 当前查看的 Skill。 */
  skill: SkillDefinition | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /**
   * 请求关闭详情面板。
   * @param event - 事件名
   */
  (event: 'close'): void;
}>();

const selectedFilePath = ref('');
const fileContent = ref('');
const fileLoading = ref(false);
const fileError = ref('');
/** 文件树中的文件数量，用于判断是否需要显示文件树。 */
const fileCount = ref(0);
let fileRequestId = 0;

/** Skill 名称首字母大写，用于图标展示。 */
const initial = computed<string>(() => props.skill?.name.charAt(0).toUpperCase() ?? 'S');

/** 展示用描述，移除开头的双引号。 */
const normalizedDescription = computed<string>(() => {
  const description = props.skill?.description ?? '';
  return description.startsWith('"') ? description.slice(1) : description;
});

/** 当前选中文件名称。 */
const selectedFileName = computed<string>(() => selectedFilePath.value.split('/').at(-1) ?? '未选择文件');

/** 文件数量大于 1 时显示文件树。 */
const showFileTree = computed<boolean>(() => fileCount.value > 1);

/**
 * 文件树加载完成回调，记录文件数量。
 * @param count - 文件数量
 */
function handleTreeLoaded(count: number): void {
  fileCount.value = count;
}

/**
 * 读取并展示指定文件内容。
 * @param filePath - 文件路径
 */
async function loadFileContent(filePath: string): Promise<void> {
  const requestId = ++fileRequestId;
  selectedFilePath.value = filePath;
  fileLoading.value = true;
  fileError.value = '';
  fileContent.value = '';

  try {
    const { content } = await native.readFile(filePath);
    if (requestId !== fileRequestId) {
      return;
    }
    fileContent.value = content;
  } catch (error: unknown) {
    if (requestId !== fileRequestId) {
      return;
    }
    fileError.value = error instanceof Error ? error.message : '无法预览该文件。';
  } finally {
    if (requestId === fileRequestId) {
      fileLoading.value = false;
    }
  }
}

/**
 * 处理文件选中事件。
 * @param filePath - 选中的文件路径
 */
function handleSelectFile(filePath: string): void {
  loadFileContent(filePath).catch((error: unknown) => {
    console.error('Skill file preview failed:', error);
  });
}

watch(
  () => props.skill?.filePath,
  (filePath) => {
    if (filePath) {
      loadFileContent(filePath).catch((error: unknown) => {
        console.error('Skill file preview failed:', error);
      });
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
.skill-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  user-select: text;
}

/* 覆盖 BSettingsPage body 默认样式，使内容区作为 flex 容器并禁止自身滚动 */
.skill-detail :deep(.b-settings-page__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
}

.skill-detail__title {
  display: flex;
  gap: 8px;
  align-items: center;
}

.skill-detail__header {
  display: flex;
  align-items: flex-start;
}

.skill-detail__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.skill-detail__meta {
  min-width: 0;
}

.skill-detail__name {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.skill-detail__name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-detail__desc {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.skill-detail__tag {
  flex-shrink: 0;
  padding: 2px 6px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-tertiary);
  border-radius: 4px;
}

.skill-detail__parse-error {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--color-danger, #ff4d4f);
  background: var(--color-danger-bg, #fff2f0);
  border-radius: 6px;
}

.skill-detail__path {
  padding: 6px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  background: var(--bg-secondary);
  border: 1px solid var(--border-tertiary);
  border-radius: 6px;
}

.skill-detail__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-tertiary);
  border-radius: 6px;
}

.skill-detail__preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-primary);
}

.skill-detail__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-tertiary);
}

.skill-detail__preview-content {
  flex: 1;
  min-height: 0;
  padding: 12px;
  margin: 0;
  overflow: auto;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.skill-detail__preview-empty,
.skill-detail__preview-error {
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-detail__preview-error {
  color: var(--color-danger, #ff4d4f);
}
</style>
