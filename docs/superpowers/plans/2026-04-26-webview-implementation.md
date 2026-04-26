# WebView 功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 主窗口中嵌入外部网页浏览功能，支持地址栏导航、后退前进刷新、右键菜单（在新标签页打开、复制链接、在系统浏览器打开）

**Architecture:** WebContentsView + Vue 壳组件 + IPC 通信。主进程管理 WebContentsView 实例，Vue 组件负责地址栏/导航/状态显示，通过 IPC 控制视图。

**Tech Stack:** Electron 41 WebContentsView, Vue 3.5 Composition API, Pinia, TypeScript

---

## 文件映射

| 操作 | 文件路径 | 职责 |
|---|---|---|
| CREATE | `electron/main/modules/webview/ipc.ts` | WebViewManager 类 + IPC handlers |
| CREATE | `electron/main/modules/webview/index.ts` | 导出 registerWebviewHandlers |
| CREATE | `electron/preload/webview.ts` | webview preload 脚本 |
| CREATE | `src/views/webview/types.ts` | WebViewState 等类型定义 |
| CREATE | `src/views/webview/hooks/useWebView.ts` | useWebView composable |
| CREATE | `src/views/webview/AddressBar.vue` | 地址栏组件 |
| CREATE | `src/views/webview/index.vue` | WebViewShell 主组件 |
| CREATE | `src/router/routes/modules/webview.ts` | 路由配置 |
| MODIFY | `electron/main/modules/index.mts` | 注册 WebView handlers |
| MODIFY | `electron/preload/index.mts` | 添加 webview API |
| MODIFY | `types/electron-api.d.ts` | 添加 WebView 类型 |

---

## Task 1: 主进程 WebViewManager + IPC handlers

**Files:**
- Create: `electron/main/modules/webview/ipc.ts`
- Create: `electron/main/modules/webview/index.ts`
- Modify: `electron/main/modules/index.mts:1-10` (添加 import)
- Modify: `electron/main/modules/index.mts:12-23` (registerAllIpcHandlers 中添加调用)

- [ ] **Step 1: 创建 `electron/main/modules/webview/ipc.ts`**

```typescript
import { ipcMain, WebContentsView, BrowserWindow, shell, Menu, clipboard, app } from 'electron';
import path from 'node:path';

interface WebViewState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loadProgress: number;
}

class WebViewManager {
  private views: Map<string, WebContentsView> = new Map();
  private tabIdMap: Map<number, string> = new Map();
  private activeTabId: string | null = null;

  create(tabId: string, url: string): void {
    if (this.views.has(tabId)) {
      this.destroy(tabId);
    }

    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '../../preload/webview.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });

    this.attachListeners(view, tabId);
    view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
      shell.openExternal(openUrl);
      return { action: 'deny' };
    });

    const win = BrowserWindow.getAllWindows()[0];
    win.contentView.addChildView(view);
    view.webContents.loadURL(url);

    this.views.set(tabId, view);
    this.tabIdMap.set(view.webContents.id, tabId);
  }

  destroy(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    const win = BrowserWindow.getAllWindows()[0];
    win.contentView.removeChildView(view);
    view.webContents.close();
    this.tabIdMap.delete(view.webContents.id);
    this.views.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  navigate(tabId: string, url: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.webContents.loadURL(url);
  }

  goBack(tabId: string): void {
    const view = this.views.get(tabId);
    if (view?.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  }

  goForward(tabId: string): void {
    const view = this.views.get(tabId);
    if (view?.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  }

  reload(tabId: string): void {
    const view = this.views.get(tabId);
    view?.webContents.reload();
  }

  stop(tabId: string): void {
    const view = this.views.get(tabId);
    view?.webContents.stop();
  }

  show(tabId: string): void {
    if (this.activeTabId === tabId) return;
    if (this.activeTabId) {
      const prev = this.views.get(this.activeTabId);
      prev?.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    this.activeTabId = tabId;
    const view = this.views.get(tabId);
    if (view) {
      view.setBounds(this.lastBounds || { x: 0, y: 0, width: 800, height: 600 });
    }
  }

  hide(tabId: string): void {
    const view = this.views.get(tabId);
    if (view) {
      this.lastBounds = view.getBounds();
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  private lastBounds: Electron.Rectangle | null = null;

  setBounds(tabId: string, bounds: Electron.Rectangle): void {
    const view = this.views.get(tabId);
    if (view) {
      view.setBounds(bounds);
    }
  }

  private attachListeners(view: WebContentsView, tabId: string): void {
    const send = (channel: string, ...args: unknown[]) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send(channel, tabId, ...args);
    };

    view.webContents.on('did-start-loading', () => {
      send('webview:state-changed', { isLoading: true, loadProgress: 0 } as WebViewState);
    });

    view.webContents.on('did-stop-loading', () => {
      send('webview:state-changed', { isLoading: false, loadProgress: 1 } as WebViewState);
    });

    view.webContents.on('did-finish-load', () => {
      send('webview:title-updated', view.webContents.getTitle());
      send('webview:navigation-state-changed',
        view.webContents.canGoBack(),
        view.webContents.canGoForward()
      );
    });

    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`Failed to load: ${errorDescription} (${errorCode})`);
    });

    view.webContents.on('page-title-updated', (_event, title) => {
      send('webview:title-updated', title);
    });

    view.webContents.on('did-change-navigation-state', () => {
      send('webview:navigation-state-changed',
        view.webContents.canGoBack(),
        view.webContents.canGoForward()
      );
    });

    // 右键菜单
    view.webContents.on('context-menu', (_event, params) => {
      const menuItems: Electron.MenuItemConstructorOptions[] = [];

      if (params.linkURL) {
        menuItems.push(
          { label: '在新标签页打开', click: () => send('webview:open-in-new-tab', params.linkURL) },
          { label: '复制链接地址', click: () => clipboard.writeText(params.linkURL) },
          { label: '在系统浏览器打开', click: () => shell.openExternal(params.linkURL) },
          { type: 'separator' }
        );
      }

      menuItems.push(
        { label: '后退', enabled: view.webContents.canGoBack(), click: () => this.goBack(tabId) },
        { label: '前进', enabled: view.webContents.canGoForward(), click: () => this.goForward(tabId) },
        { label: '刷新', click: () => this.reload(tabId) },
        { type: 'separator' },
        { label: '停止', click: () => this.stop(tabId) }
      );

      const menu = Menu.buildFromTemplate(menuItems);
      menu.popup();
    });

    // 导航拦截（仅 http/https）
    view.webContents.on('will-navigate', (event, url) => {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });
  }
}

const manager = new WebViewManager();

export function registerWebviewHandlers(): void {
  ipcMain.handle('webview:create', (_event, tabId: string, url: string) => {
    manager.create(tabId, url);
  });

  ipcMain.handle('webview:destroy', (_event, tabId: string) => {
    manager.destroy(tabId);
  });

  ipcMain.handle('webview:navigate', (_event, tabId: string, url: string) => {
    manager.navigate(tabId, url);
  });

  ipcMain.handle('webview:go-back', (_event, tabId: string) => {
    manager.goBack(tabId);
  });

  ipcMain.handle('webview:go-forward', (_event, tabId: string) => {
    manager.goForward(tabId);
  });

  ipcMain.handle('webview:reload', (_event, tabId: string) => {
    manager.reload(tabId);
  });

  ipcMain.handle('webview:stop', (_event, tabId: string) => {
    manager.stop(tabId);
  });

  ipcMain.handle('webview:set-bounds', (_event, tabId: string, bounds: Electron.Rectangle) => {
    manager.setBounds(tabId, bounds);
  });

  ipcMain.handle('webview:show', (_event, tabId: string) => {
    manager.show(tabId);
  });

  ipcMain.handle('webview:hide', (_event, tabId: string) => {
    manager.hide(tabId);
  });
}
```

- [ ] **Step 2: 创建 `electron/main/modules/webview/index.ts`**

```typescript
export { registerWebviewHandlers } from './ipc.js';
```

- [ ] **Step 3: 修改 `electron/main/modules/index.mts`，添加 webview import 和注册**

在 import 区域添加（第 10 行后）：
```typescript
import { registerWebviewHandlers } from './webview/index.mjs';
```

在 `registerAllIpcHandlers()` 函数中添加（第 22 行后）：
```typescript
registerWebviewHandlers();
```

在 export 区域添加（第 34 行后）：
```typescript
registerWebviewHandlers,
```

- [ ] **Step 4: Commit**

```bash
git add electron/main/modules/webview/ electron/main/modules/index.mts
git commit -m "feat(webview): add WebViewManager and IPC handlers"
```

---

## Task 2: Preload 脚本

**Files:**
- Create: `electron/preload/webview.ts`
- Modify: `electron/preload/index.mts` (添加 webview 到 electronAPI)
- Modify: `types/electron-api.d.ts` (添加 WebViewState 和 webview API 类型)

- [ ] **Step 1: 修改 `types/electron-api.d.ts`，添加 WebView 类型**

在 `FileChangeEvent` 接口后添加：

```typescript
export interface WebViewState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loadProgress: number;
}

export interface WebViewAPI {
  create: (tabId: string, url: string) => Promise<void>;
  destroy: (tabId: string) => Promise<void>;
  navigate: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  stop: (tabId: string) => Promise<void>;
  setBounds: (tabId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
  show: (tabId: string) => Promise<void>;
  hide: (tabId: string) => Promise<void>;
  onStateChanged: (callback: (tabId: string, state: WebViewState) => void) => () => void;
  onTitleUpdated: (callback: (tabId: string, title: string) => void) => () => void;
  onNavigationStateChanged: (callback: (tabId: string, canGoBack: boolean, canGoForward: boolean) => void) => () => void;
  onOpenInNewTab: (callback: (url: string) => void) => () => void;
}
```

在 `ElectronAPI` 接口中添加（第 182 行后）：
```typescript
  // WebView 操作
  webview: WebViewAPI;
```

- [ ] **Step 2: 创建 `electron/preload/webview.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { WebViewAPI, WebViewState } from '../../types/electron-api';

const webview: WebViewAPI = {
  create: (tabId, url) => ipcRenderer.invoke('webview:create', tabId, url),
  destroy: (tabId) => ipcRenderer.invoke('webview:destroy', tabId),
  navigate: (tabId, url) => ipcRenderer.invoke('webview:navigate', tabId, url),
  goBack: (tabId) => ipcRenderer.invoke('webview:go-back', tabId),
  goForward: (tabId) => ipcRenderer.invoke('webview:go-forward', tabId),
  reload: (tabId) => ipcRenderer.invoke('webview:reload', tabId),
  stop: (tabId) => ipcRenderer.invoke('webview:stop', tabId),
  setBounds: (tabId, bounds) => ipcRenderer.invoke('webview:set-bounds', tabId, bounds),
  show: (tabId) => ipcRenderer.invoke('webview:show', tabId),
  hide: (tabId) => ipcRenderer.invoke('webview:hide', tabId),

  onStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, state: WebViewState) => {
      callback(tabId, state);
    };
    ipcRenderer.on('webview:state-changed', handler);
    return () => ipcRenderer.removeListener('webview:state-changed', handler);
  },

  onTitleUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, title: string) => {
      callback(tabId, title);
    };
    ipcRenderer.on('webview:title-updated', handler);
    return () => ipcRenderer.removeListener('webview:title-updated', handler);
  },

  onNavigationStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, tabId: string, canGoBack: boolean, canGoForward: boolean) => {
      callback(tabId, canGoBack, canGoForward);
    };
    ipcRenderer.on('webview:navigation-state-changed', handler);
    return () => ipcRenderer.removeListener('webview:navigation-state-changed', handler);
  },

  onOpenInNewTab: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => {
      callback(url);
    };
    ipcRenderer.on('webview:open-in-new-tab', handler);
    return () => ipcRenderer.removeListener('webview:open-in-new-tab', handler);
  }
};

export default webview;
```

- [ ] **Step 3: 修改 `electron/preload/index.mts`，添加 webview API**

在 `contextBridge.exposeInMainWorld` 调用之前添加导入：
```typescript
import webviewAPI from './webview.mjs';
```

在 electronAPI 对象中添加 webview 属性：
```typescript
  // WebView 操作
  webview: webviewAPI,
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload/webview.ts electron/preload/index.mts types/electron-api.d.ts
git commit -m "feat(webview): add preload script and types"
```

---

## Task 3: Vue 组件

**Files:**
- Create: `src/views/webview/types.ts`
- Create: `src/views/webview/hooks/useWebView.ts`
- Create: `src/views/webview/AddressBar.vue`
- Create: `src/views/webview/index.vue`
- Create: `src/router/routes/modules/webview.ts`

- [ ] **Step 1: 创建 `src/views/webview/types.ts`**

```typescript
export interface WebViewState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loadProgress: number;
}

export interface WebViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

- [ ] **Step 2: 创建 `src/views/webview/hooks/useWebView.ts`**

```typescript
import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import type { WebViewState } from '../types';

export function useWebView(tabId: Ref<string> | string) {
  const tabIdValue = typeof tabId === 'string' ? tabId : tabId.value;

  const state = ref<WebViewState>({
    url: '',
    title: '',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    loadProgress: 0
  });

  const create = (url: string) => window.electronAPI!.webview.create(tabIdValue, url);
  const destroy = () => window.electronAPI!.webview.destroy(tabIdValue);
  const navigate = (url: string) => window.electronAPI!.webview.navigate(tabIdValue, url);
  const goBack = () => window.electronAPI!.webview.goBack(tabIdValue);
  const goForward = () => window.electronAPI!.webview.goForward(tabIdValue);
  const reload = () => window.electronAPI!.webview.reload(tabIdValue);
  const stop = () => window.electronAPI!.webview.stop(tabIdValue);
  const setBounds = (bounds: { x: number; y: number; width: number; height: number }) =>
    window.electronAPI!.webview.setBounds(tabIdValue, bounds);
  const show = () => window.electronAPI!.webview.show(tabIdValue);
  const hide = () => window.electronAPI!.webview.hide(tabIdValue);

  let unsubState: (() => void) | null = null;
  let unsubTitle: (() => void) | null = null;
  let unsubNav: (() => void) | null = null;
  let unsubOpenInNewTab: (() => void) | null = null;

  const setupListeners = () => {
    unsubState = window.electronAPI!.webview.onStateChanged((id, s) => {
      if (id === tabIdValue) {
        state.value.isLoading = s.isLoading;
        state.value.loadProgress = s.loadProgress;
        if (s.url) state.value.url = s.url;
      }
    });

    unsubTitle = window.electronAPI!.webview.onTitleUpdated((id, title) => {
      if (id === tabIdValue) {
        state.value.title = title;
      }
    });

    unsubNav = window.electronAPI!.webview.onNavigationStateChanged((id, canGoBack, canGoForward) => {
      if (id === tabIdValue) {
        state.value.canGoBack = canGoBack;
        state.value.canGoForward = canGoForward;
      }
    });
  };

  const onOpenInNewTab = (callback: (url: string) => void) => {
    unsubOpenInNewTab = window.electronAPI!.webview.onOpenInNewTab((url) => {
      callback(url);
    });
    return () => unsubOpenInNewTab?.();
  };

  const cleanupListeners = () => {
    unsubState?.();
    unsubTitle?.();
    unsubNav?.();
    unsubOpenInNewTab?.();
  };

  onMounted(() => {
    setupListeners();
  });

  onUnmounted(() => {
    cleanupListeners();
  });

  return {
    state,
    create,
    destroy,
    navigate,
    goBack,
    goForward,
    reload,
    stop,
    setBounds,
    show,
    hide,
    setupListeners,
    cleanupListeners,
    onOpenInNewTab
  };
}
```

- [ ] **Step 3: 创建 `src/views/webview/AddressBar.vue`**

```vue
<script setup lang="ts">
defineProps<{
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  navigate: [url: string];
  goBack: [];
  goForward: [];
  reload: [];
  stop: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const handleSubmit = () => {
  const url = inputRef.value?.value.trim() || '';
  if (!url) return;

  // 自动添加 https:// 如果没有协议
  let finalUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    finalUrl = 'https://' + url;
  }

  emit('navigate', finalUrl);
};
</script>

<template>
  <div class="address-bar">
    <div class="nav-buttons">
      <button
        class="nav-btn"
        :disabled="!canGoBack"
        title="后退"
        @click="emit('goBack')"
      >
        ←
      </button>
      <button
        class="nav-btn"
        :disabled="!canGoForward"
        title="前进"
        @click="emit('goForward')"
      >
        →
      </button>
      <button
        class="nav-btn"
        :disabled="!isLoading"
        title="停止"
        @click="emit('stop')"
      >
        ⏹
      </button>
      <button
        class="nav-btn"
        title="刷新"
        @click="emit('reload')"
      >
        ↻
      </button>
    </div>

    <div class="url-input-wrapper">
      <input
        ref="inputRef"
        type="text"
        class="url-input"
        :value="url"
        placeholder="输入网址..."
        spellcheck="false"
        autocomplete="off"
        @keydown.enter="handleSubmit"
      />
      <button class="go-btn" title="转到" @click="handleSubmit">⏎</button>
    </div>
  </div>
</template>

<style scoped>
.address-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.nav-buttons {
  display: flex;
  gap: 4px;
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover:not(:disabled) {
  background: var(--hover-bg, #e0e0e0);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.url-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--bg-input, #fff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  overflow: hidden;
}

.url-input {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-size: 14px;
  outline: none;
}

.go-btn {
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
}

.go-btn:hover {
  background: var(--hover-bg, #e0e0e0);
}
</style>
```

- [ ] **Step 4: 创建 `src/views/webview/index.vue`**

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { customAlphabet } from 'nanoid';
import AddressBar from './AddressBar.vue';
import { useWebView } from './hooks/useWebView';
import { useTabsStore } from '@/stores/tabs';

const route = useRoute();
const router = useRouter();
const tabsStore = useTabsStore();
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

const tabId = computed(() => route.query.tabId as string || 'default');
const initialUrl = computed(() => route.query.url as string || '');

const webviewContainerRef = ref<HTMLElement | null>(null);

const {
  state,
  create,
  destroy,
  navigate,
  goBack,
  goForward,
  reload,
  stop,
  setBounds,
  show,
  hide,
  onOpenInNewTab
} = useWebView(tabId);

const updateBounds = () => {
  if (!webviewContainerRef.value) return;
  const rect = webviewContainerRef.value.getBoundingClientRect();
  setBounds({
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
};

const handleOpenInNewTab = (url: string) => {
  const newTabId = nanoid();
  tabsStore.addTab({
    id: newTabId,
    path: `/webview?tabId=${newTabId}&url=${encodeURIComponent(url)}`,
    title: new URL(url).hostname,
    cacheKey: newTabId
  });
  router.push({ name: 'webview', query: { tabId: newTabId, url } });
};

onMounted(async () => {
  await create(initialUrl.value);
  updateBounds();
  await show();
  onOpenInNewTab(handleOpenInNewTab);
});

onActivated(async () => {
  await show();
  updateBounds();
});

onDeactivated(async () => {
  await hide();
});

onBeforeUnmount(async () => {
  await destroy();
});

const handleNavigate = (url: string) => {
  navigate(url);
};
</script>

<template>
  <div class="webview-shell">
    <AddressBar
      :url="state.url"
      :can-go-back="state.canGoBack"
      :can-go-forward="state.canGoForward"
      :is-loading="state.isLoading"
      @navigate="handleNavigate"
      @go-back="goBack"
      @go-forward="goForward"
      @reload="reload"
      @stop="stop"
    />

    <div ref="webviewContainerRef" class="webview-content">
      <!-- WebContentsView 渲染在主进程，这里只是占位 -->
    </div>

    <div v-if="state.isLoading" class="loading-bar">
      <div class="loading-progress" :style="{ width: `${state.loadProgress * 100}%` }"></div>
    </div>
  </div>
</template>

<style scoped>
.webview-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.webview-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.loading-bar {
  height: 2px;
  background: var(--border-color, #e0e0e0);
}

.loading-progress {
  height: 100%;
  background: var(--primary-color, #1890ff);
  transition: width 0.2s ease;
}
</style>
```

- [ ] **Step 5: 创建 `src/router/routes/modules/webview.ts`**

```typescript
import type { AppRouteRecordRaw } from '../../type';

const routes: AppRouteRecordRaw[] = [
  {
    path: '/webview',
    name: 'webview',
    component: () => import('@/views/webview/index.vue'),
    meta: { title: '网页浏览' }
  }
];

export default { routes };
```

- [ ] **Step 6: Commit**

```bash
git add src/views/webview/ src/router/routes/modules/webview.ts
git commit -m "feat(webview): add Vue components and router"
```

---

## Task 4: 集成与测试

**Files:**
- Modify: `electron/main/index.mts` (如需特殊初始化)
- Test: 运行 dev 验证功能

- [ ] **Step 1: 验证文件结构**

确认以下文件存在：
```
electron/main/modules/webview/index.ts
electron/main/modules/webview/ipc.ts
electron/preload/webview.ts
src/views/webview/types.ts
src/views/webview/hooks/useWebView.ts
src/views/webview/AddressBar.vue
src/views/webview/index.vue
src/router/routes/modules/webview.ts
```

- [ ] **Step 2: 运行开发服务器测试**

```bash
npm run dev
```

- [ ] **Step 3: 测试用例**

1. 导航到 `/webview?url=https://example.com`，验证页面加载
2. 在地址栏输入 `github.com`，验证自动添加 https:// 并跳转
3. 点击后退/前进按钮，验证导航
4. 右键点击页面，验证右键菜单显示
5. 在新标签页打开链接，验证 tabId 参数传递

- [ ] **Step 4: Commit (如有修改)**

```bash
git add -A
git commit -m "fix(webview): [修复内容]"
```

---

## 实施顺序

1. **Task 1** - 主进程 WebViewManager + IPC handlers
2. **Task 2** - Preload 脚本
3. **Task 3** - Vue 组件
4. **Task 4** - 集成与测试
