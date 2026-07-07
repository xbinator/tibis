<!--
  @file index.vue
  @description 小组件设置页，扫描 .tibis/widgets/<name>/widget.json 并管理创建与启用状态。
-->
<template>
  <SettingsPage class="widget-settings" :title="MENU_ITEMS.widget.label">
    <template #extra>
      <BButton icon="lucide:plus" type="primary" size="small" @click="openCreateModal">创建小组件</BButton>
    </template>

    <SettingsSection title="搜索路径" content-class="widget-settings__content">
      <div class="widget-settings__hint">小组件 JSON 文件放置在 <code>.tibis/widgets/&lt;name&gt;/widget.json</code> 即可自动发现</div>
    </SettingsSection>

    <SettingsSection title="已安装">
      <div v-if="store.widgets.length === 0" class="widget-settings__empty">
        {{ store.initialized ? '未发现任何小组件' : '正在扫描…' }}
      </div>

      <div v-for="widget in pagedWidgets" :key="widget.filePath" class="widget-settings__item">
        <WidgetItemRow :widget="widget" @toggle="store.toggleWidget" @open="handleOpenWidget" />
      </div>

      <SettingsPagination v-model:current="currentPage" :total="store.widgets.length" :page-size="PAGE_SIZE" />
    </SettingsSection>
  </SettingsPage>

  <WidgetCreator v-model:open="createModalOpen" :existing-ids="existingWidgetIds" @confirm="handleCreateConfirm" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { WidgetDefinition, WidgetImportResource } from '@/ai/widget';
import { joinPath, parseWidgetJson } from '@/ai/widget';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { native } from '@/shared/platform';
import { getElectronAPI } from '@/shared/platform/electron-api';
import type { ReadWorkspaceDirectoryOptions } from '@/shared/platform/native/types';
import { useWidgetStore } from '@/stores/ai/widget';
import { useFilesStore } from '@/stores/workspace/files';
import { normalizeZipEntryPath } from '@/utils/zip/package';
import SettingsPage from '@/views/settings/_components/SettingsPage.vue';
import SettingsPagination from '@/views/settings/_components/SettingsPagination.vue';
import SettingsSection from '@/views/settings/_components/SettingsSection.vue';
import { MENU_ITEMS } from '@/views/settings/constants';
import WidgetCreator, { type WidgetCreatePayload } from './components/WidgetCreator.vue';
import WidgetItemRow from './components/WidgetItemRow.vue';

/** 每页显示数量。 */
const PAGE_SIZE = 8;

const route = useRoute();
const router = useRouter();
const store = useWidgetStore();
const filesStore = useFilesStore();
/** 是否正在初始化扫描。 */
const initializing = ref(false);
/** 创建弹窗开关。 */
const createModalOpen = ref(false);

/**
 * 当前页码，来源为路由查询参数 `page`。
 */
const currentPage = computed<number>({
  get(): number {
    const raw = route.query.page;
    const value = Number(Array.isArray(raw) ? raw[0] : raw);

    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  },
  set(value: number): void {
    router.replace({ query: { ...route.query, page: String(value) } });
  }
});

/** 总页数，最少为 1。 */
const totalPages = computed<number>(() => Math.max(1, Math.ceil(store.widgets.length / PAGE_SIZE)));

/** 当前页小组件列表。 */
const pagedWidgets = computed<WidgetDefinition[]>((): WidgetDefinition[] => {
  const start = (currentPage.value - 1) * PAGE_SIZE;

  return store.widgets.slice(start, start + PAGE_SIZE);
});

/** 已存在的小组件 ID 列表，用于创建时去重校验。 */
const existingWidgetIds = computed<string[]>((): string[] => store.widgets.map((widget: WidgetDefinition): string => widget.id));
/**
 * 初始化小组件扫描。
 * @returns 初始化完成信号
 */
async function initWidgetStore(): Promise<void> {
  if (store.initialized || initializing.value) {
    return;
  }

  initializing.value = true;
  try {
    const homeDir = await native.getHomeDir();
    await store.init(homeDir, {
      readFile: (filePath: string) => native.readFile(filePath).then((result) => ({ content: result.content })),
      readWorkspaceDirectory: (options: ReadWorkspaceDirectoryOptions) => native.readWorkspaceDirectory(options)
    });
  } catch (error: unknown) {
    console.error('Widget settings initialization failed:', error);
  } finally {
    initializing.value = false;
  }
}

/**
 * 从磁盘读取最新小组件定义，避免设置页使用过期的 store 缓存打开编辑器。
 * @param widget - 当前列表中的小组件定义
 * @returns 最新小组件定义，读取失败时返回原定义
 */
async function readLatestWidgetDefinition(widget: WidgetDefinition): Promise<WidgetDefinition> {
  try {
    const { content } = await native.readFile(widget.filePath);
    const latestWidget = {
      ...parseWidgetJson(content, widget.filePath),
      enabled: widget.enabled
    };

    store.upsertWidget(latestWidget);
    return latestWidget;
  } catch (error: unknown) {
    console.error('Read latest widget failed:', error);
    return widget;
  }
}

/**
 * 将小组件数据作为 Widget JSON 文件会话打开。
 * @param widget - 小组件定义
 * @returns 打开完成信号
 */
async function openWidgetEditor(widget: WidgetDefinition): Promise<void> {
  const content = JSON.stringify(widget.data, null, 2);
  const openedFile = await filesStore.createAndOpen({
    type: 'widget',
    id: `widget-${widget.id}`,
    path: widget.filePath,
    name: widget.id,
    ext: 'json',
    content,
    savedContent: content
  });

  await router.push({ name: 'widget', params: { id: openedFile.id } });
}

/**
 * 打开小组件创建弹窗。
 */
function openCreateModal(): void {
  createModalOpen.value = true;
}

/**
 * 读取资源相对路径的父目录。
 * @param relativePath - 资源相对路径
 * @returns 父目录相对路径
 */
function readWidgetResourceParentPath(relativePath: string): string {
  const normalized = normalizeZipEntryPath(relativePath);
  const index = normalized.lastIndexOf('/');

  return index > -1 ? normalized.slice(0, index) : '';
}

/**
 * 写入单个 zip 导入的小组件资源文件。
 * @param widgetDir - 小组件目标目录
 * @param resource - 待写入资源
 * @returns 写入完成信号
 */
async function writeWidgetImportResource(widgetDir: string, resource: WidgetImportResource): Promise<void> {
  const relativePath = normalizeZipEntryPath(resource.relativePath);
  const parentPath = readWidgetResourceParentPath(relativePath);
  const filePath = joinPath(widgetDir, relativePath);

  if (parentPath) {
    await getElectronAPI().ensureDir(joinPath(widgetDir, parentPath));
  }

  await native.saveBinaryFile(resource.content, filePath);
}

/**
 * 写入 zip 导入的小组件资源文件。
 * @param widgetDir - 小组件目标目录
 * @param resources - 待写入资源
 * @returns 写入完成信号
 */
async function writeWidgetImportResources(widgetDir: string, resources: WidgetImportResource[]): Promise<void> {
  await Promise.all(resources.map((resource: WidgetImportResource): Promise<void> => writeWidgetImportResource(widgetDir, resource)));
}

/**
 * 确认创建小组件。
 * @param payload - 创建表单提交数据
 * @returns 创建完成信号
 */
async function handleCreateConfirm(payload: WidgetCreatePayload): Promise<void> {
  const widgetId = payload.id;
  const widgetName = payload.name;
  const widgetDescription = payload.description;
  const homeDir = await native.getHomeDir();
  const widgetDir = joinPath(homeDir, '.tibis', 'widgets', widgetId);
  const payloadWidgetData = payload.data ?? createDefaultWidgetData(widgetId);
  const widgetData = {
    ...payloadWidgetData,
    name: widgetName,
    description: widgetDescription
  };
  const filePath = joinPath(widgetDir, 'widget.json');
  const createdWidget: WidgetDefinition = {
    id: widgetId,
    name: widgetData.name,
    description: widgetData.description,
    data: widgetData,
    filePath,
    enabled: true,
    parsedAt: Date.now()
  };

  await getElectronAPI().ensureDir(widgetDir);
  await writeWidgetImportResources(widgetDir, payload.resources ?? []);
  await native.writeFile(filePath, JSON.stringify(widgetData, null, 2));
  await store.rescan();
  store.upsertWidget(createdWidget);

  createModalOpen.value = false;

  await openWidgetEditor(createdWidget);
}

/**
 * 跳转到小组件编辑页。
 * @param id - 小组件 ID
 */
function handleOpenWidget(id: string): void {
  const widget = store.getWidgetById(id);

  if (!widget) {
    return;
  }

  readLatestWidgetDefinition(widget)
    .then((latestWidget: WidgetDefinition): Promise<void> => openWidgetEditor(latestWidget))
    .catch((error: unknown): void => {
      console.error('Open widget editor failed:', error);
    });
}

watch(
  [currentPage, totalPages],
  ([page, pages]: [number, number]): void => {
    if (page > pages) {
      currentPage.value = pages;
    }
  },
  { immediate: true }
);

onMounted((): void => {
  initWidgetStore().catch((error: unknown): void => {
    console.error('Widget settings initialization failed:', error);
  });
});
</script>

<style scoped lang="less">
.widget-settings {
  height: 100%;
  min-height: 0;
}

.widget-settings__hint {
  font-size: 12px;
  color: var(--text-secondary);
  user-select: text;
}

.widget-settings__hint code {
  padding: 1px 4px;
  font-size: 11px;
  background: var(--bg-tertiary);
  border-radius: 3px;
}

:deep(.widget-settings__content) {
  padding: 16px 20px;
}

.widget-settings__empty {
  padding: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.widget-settings__item {
  padding: 12px 20px;
}

.widget-settings__item:hover {
  background: var(--bg-hover);
}

.widget-settings__item:not(:first-child) {
  border-top: 1px solid var(--border-tertiary);
}
</style>
