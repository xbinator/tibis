<template>
  <img
    v-if="visibleFavicon"
    class="b-recent-icon b-recent-icon--favicon"
    :src="visibleFavicon"
    :style="iconStyle"
    alt=""
    v-bind="$attrs"
    @error="handleFaviconError"
  />
  <BIcon v-else class="b-recent-icon" :icon="resolvedIcon" :size="size" v-bind="$attrs" />
</template>

<script setup lang="ts">
/**
 * @file Icon.vue
 * @description 统一渲染最近记录、文件名和候选项图标，支持 WebView favicon 失败回退。
 */
import { computed, ref, type CSSProperties } from 'vue';
import type { RecentRecord } from '@/shared/storage';
import { getFileIconByName } from '@/utils/file/icons';
import { resolveFileTitle } from '@/utils/file/title';

defineOptions({
  inheritAttrs: false
});

const WEBVIEW_FALLBACK_ICON = 'vscode-icons:file-type-geojson';
const DEFAULT_FALLBACK_ICON = 'vscode-icons:default-file';

/**
 * 最近记录图标组件属性。
 */
interface Props {
  /** 最近记录；传入后自动根据 record 类型解析图标。 */
  record?: RecentRecord;
  /** 独立文件名；用于路径候选等未形成最近记录的数据。 */
  fileName?: string;
  /** 显式 Iconify 图标名。 */
  icon?: string;
  /** 显式 favicon URL。 */
  favicon?: string;
  /** 默认回退 Iconify 图标名。 */
  fallbackIcon?: string;
  /** 图标尺寸。 */
  size?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  record: undefined,
  fileName: '',
  icon: '',
  favicon: '',
  fallbackIcon: DEFAULT_FALLBACK_ICON,
  size: 14
});

const failedFavicons = ref<Set<string>>(new Set());

/**
 * 读取当前可用 favicon。
 * @returns favicon URL
 */
function resolveFavicon(): string {
  const favicon = props.favicon || (props.record?.type === 'webview' ? props.record.favicon : '');

  return favicon?.trim() ?? '';
}

const visibleFavicon = computed<string>(() => {
  const favicon = resolveFavicon();
  return favicon && !failedFavicons.value.has(favicon) ? favicon : '';
});

const resolvedIcon = computed<string>(() => {
  if (props.icon) {
    return props.icon;
  }

  if (props.record?.type === 'webview') {
    return WEBVIEW_FALLBACK_ICON;
  }

  if (props.record?.type === 'file') {
    return getFileIconByName(resolveFileTitle(props.record));
  }

  if (props.fileName) {
    return getFileIconByName(props.fileName);
  }

  return props.fallbackIcon;
});

const iconStyle = computed<CSSProperties>(() => {
  const size = typeof props.size === 'number' ? `${props.size}px` : props.size;

  return {
    width: size,
    height: size
  };
});

/**
 * 标记加载失败的 favicon，后续自动回退到 Iconify 图标。
 */
function handleFaviconError(): void {
  if (!visibleFavicon.value) {
    return;
  }

  const nextFailedFavicons = new Set(failedFavicons.value);
  nextFailedFavicons.add(visibleFavicon.value);
  failedFavicons.value = nextFailedFavicons;
}
</script>

<style scoped>
.b-recent-icon {
  display: inline-block;
  flex-shrink: 0;
}

.b-recent-icon--favicon {
  object-fit: contain;
  border-radius: 3px;
}
</style>
