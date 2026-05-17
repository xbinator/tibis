/**
 * @file createMonacoEditor.ts
 * @description Monaco 编辑器实例创建适配层，统一封装懒加载、worker 与资源释放责任。
 */

import type * as Monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

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
  updateOptions: (options: { readOnly?: boolean }) => void;
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

let cachedMonaco: typeof Monaco | null = null;
let monacoEnvironmentReady = false;

/**
 * 初始化 Monaco worker 环境。
 */
function ensureMonacoEnvironment(): void {
  if (monacoEnvironmentReady) {
    return;
  }

  const environmentHost = globalThis as typeof globalThis & MonacoEnvironmentHost;
  environmentHost.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      if (label === 'json') {
        return new JsonWorker();
      }

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

  cachedMonaco = await import('monaco-editor');
  return cachedMonaco;
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
      'editor.background': '#ffffff',
      'editorLineNumber.foreground': '#9aa3af'
    }
  });

  monaco.editor.defineTheme('tibis-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#141414',
      'editorLineNumber.foreground': '#6b7280'
    }
  });
}

/**
 * 创建 Monaco 编辑器实例。
 * @param options - 创建参数
 * @returns 适配后的编辑器句柄
 */
export async function createMonacoEditor(options: CreateMonacoEditorOptions): Promise<MonacoEditorHandle> {
  ensureMonacoEnvironment();

  const monaco = await loadMonaco();
  ensureThemes(monaco);
  monaco.editor.setTheme(options.theme);

  const model = monaco.editor.createModel(options.value, options.language);
  const editor = monaco.editor.create(options.container, {
    model,
    automaticLayout: true,
    minimap: { enabled: false },
    readOnly: options.readOnly,
    scrollBeyondLastLine: false,
    tabSize: 2
  });

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
