/**
 * @file createMonacoEditor.ts
 * @description Monaco 编辑器实例创建适配层，统一封装懒加载、worker 与资源释放责任。
 */

import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.main.js';
import { noop } from 'lodash-es';

/**
 * Monaco 编辑器主题名称。
 */
export type MonacoThemeName = 'tibis-light' | 'tibis-dark';

/**
 * Monaco 编辑器创建参数。
 */
export interface CreateMonacoEditorOptions {
  /** 宿主容器。 */
  container: HTMLElement;
  /** 初始文本。 */
  value: string;
  /** 语言标识。 */
  language: string;
  /** 是否只读。 */
  readOnly: boolean;
  /** 当前主题名。 */
  theme: MonacoThemeName;
  /** 是否自动换行 */
  wordWrap?: boolean;
  /** 是否启用内置搜索（Ctrl+F/Cmd+F），默认 true */
  search?: boolean;
  /** 是否启用格式校验（如 JSON 语法校验），默认 true */
  validation?: boolean;
  /** 是否只显示滚动条，隐藏其他装饰（glyph margin、折叠等），默认 false */
  scrollbarOnly?: boolean;
}

/**
 * 组件侧可消费的 Monaco 适配实例。
 */
export interface MonacoEditorHandle {
  /** 获取当前文本。 */
  getValue: () => string;
  /** 整体替换文本。 */
  setValue: (value: string) => void;
  /** 更新编辑器配置。 */
  updateOptions: (options: { readOnly?: boolean; wordWrap?: 'on' | 'off'; find?: Monaco.editor.IEditorFindOptions }) => void;
  /** 聚焦编辑器。 */
  focus: () => void;
  /** 读取底层编辑器实例。 */
  getEditor: () => Monaco.editor.IStandaloneCodeEditor;
  /** 读取底层文本模型。 */
  getModel: () => Monaco.editor.ITextModel;
  /** 销毁编辑器与模型。 */
  dispose: () => void;
}

/**
 * MonacoEnvironment 全局声明。
 */
interface MonacoEnvironmentHost {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker;
  };
}

/**
 * Monaco worker 构造器模块。
 */
interface MonacoWorkerModule {
  /** worker 默认导出构造器。 */
  default: new () => Worker;
}

let cachedMonaco: typeof Monaco | null = null;
let monacoEnvironmentReady = false;
let jsonDefaultsReady = false;
let editorWorkerConstructor: MonacoWorkerModule['default'] | null = null;
let jsonWorkerConstructor: MonacoWorkerModule['default'] | null = null;

/**
 * 懒加载 Monaco worker 构造器。
 */
async function ensureWorkerConstructors(): Promise<void> {
  if (editorWorkerConstructor && jsonWorkerConstructor) {
    return;
  }

  const [editorWorkerModule, jsonWorkerModule] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.worker?worker') as Promise<MonacoWorkerModule>,
    import('monaco-editor/esm/vs/language/json/json.worker?worker') as Promise<MonacoWorkerModule>
  ]);

  editorWorkerConstructor = editorWorkerModule.default;
  jsonWorkerConstructor = jsonWorkerModule.default;
}

/**
 * 初始化 Monaco worker 环境。
 */
async function ensureMonacoEnvironment(): Promise<void> {
  if (monacoEnvironmentReady) {
    return;
  }

  await ensureWorkerConstructors();

  const environmentHost = globalThis as typeof globalThis & MonacoEnvironmentHost;
  environmentHost.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      if (label === 'json' && jsonWorkerConstructor) {
        const JsonWorker = jsonWorkerConstructor;
        return new JsonWorker();
      }

      if (!editorWorkerConstructor) {
        throw new Error('Monaco editor worker is not ready');
      }

      const EditorWorker = editorWorkerConstructor;
      return new EditorWorker();
    }
  };

  monacoEnvironmentReady = true;
}

/**
 * 懒加载 Monaco 主模块。
 * @returns Monaco API
 */
async function loadMonaco(): Promise<typeof Monaco> {
  if (cachedMonaco) {
    return cachedMonaco;
  }

  cachedMonaco = await import('monaco-editor/esm/vs/editor/editor.main.js');
  return cachedMonaco;
}

/**
 * 初始化 JSON 语言服务默认配置，关闭 schema 相关提示与请求。
 * @param monaco - Monaco API
 */
async function ensureJsonDefaults(monaco: typeof Monaco): Promise<void> {
  if (jsonDefaultsReady) {
    return;
  }

  monaco.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    schemas: [],
    enableSchemaRequest: false,
    schemaRequest: 'ignore',
    schemaValidation: 'ignore',
    trailingCommas: 'error',
    comments: 'error'
  });

  jsonDefaultsReady = true;
}

/**
 * 注册 Tibis 使用的基础主题。
 * @param monaco - Monaco API
 */
function ensureThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('tibis-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#faf9f6',
      'editor.foreground': '#243042',
      'editor.lineHighlightBackground': '#eef2f7',
      'editor.selectionBackground': '#cfe3ff',
      'editor.inactiveSelectionBackground': '#e6edf5',
      'editorLineNumber.foreground': '#a0aec0',
      'editorLineNumber.activeForeground': '#334155',
      'editorCursor.foreground': '#2563eb',
      'editorGutter.background': '#faf9f6',
      'editorIndentGuide.background1': '#e5e7eb',
      'editorIndentGuide.activeBackground1': '#cbd5e1'
    }
  });

  monaco.editor.defineTheme('tibis-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#13151a',
      'editor.foreground': '#dbe4f0',
      'editor.lineHighlightBackground': '#1a1d24',
      'editor.selectionBackground': '#3a4e69',
      'editor.inactiveSelectionBackground': '#2a3544',
      'editorLineNumber.foreground': '#64748b',
      'editorLineNumber.activeForeground': '#e2e8f0',
      'editorCursor.foreground': '#93c5fd',
      'editorGutter.background': '#13151a',
      'editorIndentGuide.background1': '#223045',
      'editorIndentGuide.activeBackground1': '#475569'
    }
  });
}

/**
 * 创建 Monaco 编辑器实例。
 * @param options - 创建参数
 * @returns 适配后的编辑器句柄
 */
export async function createMonacoEditor(options: CreateMonacoEditorOptions): Promise<MonacoEditorHandle> {
  await ensureMonacoEnvironment();

  const monaco = await loadMonaco();
  if (options.language === 'json') {
    await ensureJsonDefaults(monaco);
  }
  ensureThemes(monaco);
  monaco.editor.setTheme(options.theme);

  const model = monaco.editor.createModel(options.value, options.language);

  const hasSearch = options.search !== false;

  const editor = monaco.editor.create(options.container, {
    model,
    // 关闭自动布局，避免内容超出容器。
    automaticLayout: true,
    // 关闭行号。
    lineNumbers: 'off',
    // 开启平滑光标动画。
    cursorSmoothCaretAnimation: 'on',
    fontFamily: '"JetBrains Mono", "SFMono-Regular", "Consolas", "Liberation Mono", monospace',
    // 开启字体连atures，显示连字。
    fontLigatures: true,
    fontSize: 15,
    lineHeight: 24,
    minimap: { enabled: false },
    readOnly: options.readOnly,
    padding: {
      top: 18,
      bottom: 18
    },
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordWrap: options.wordWrap ? 'on' : 'off',
    ...(hasSearch
      ? {
          find: {
            addExtraSpaceOnTop: false,
            autoFindInSelection: 'never',
            seedSearchStringFromSelection: 'always',
            loop: true
          }
        }
      : {})
  });

  // 禁用内置搜索快捷键
  if (!hasSearch) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, noop);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, noop);
  }

  return {
    getValue: () => model.getValue(),
    setValue: (value: string) => model.setValue(value),
    updateOptions: (nextOptions) => editor.updateOptions(nextOptions),
    focus: () => editor.focus(),
    getEditor: () => editor,
    getModel: () => model,
    dispose: () => {
      editor.dispose();
      model.dispose();
    }
  };
}
