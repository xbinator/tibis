import type { ElectronDialogFilter, ElectronOpenFileOptions, ElectronSaveFileOptions } from 'types/electron-api';

export type FileFilter = ElectronDialogFilter;

export type OpenFileOptions = ElectronOpenFileOptions;

export type SaveFileOptions = ElectronSaveFileOptions;

export interface File {
  // 文件路径
  path: string | null;
  // 文件内容
  content: string;
  // 文件名
  name: string;
  // 文件扩展名
  ext: string;
}

export interface FileChangeEvent {
  type: 'change' | 'unlink';
  filePath: string;
  content?: string;
}

export interface Native {
  openFile(options?: OpenFileOptions): Promise<File>;

  saveFile(content: string, path?: string, options?: SaveFileOptions): Promise<string | null>;

  writeFile(path: string, content: string): Promise<void>;

  watchFile(path: string): Promise<void>;

  unwatchFile(): Promise<void>;

  onFileChanged(callback: (data: FileChangeEvent) => void): () => void;

  setWindowTitle(title: string): Promise<void>;

  onMenuAction?(callback: (action: string) => void): () => void;

  updateMenuItem?(id: string, properties: { checked?: boolean }): void;
}
