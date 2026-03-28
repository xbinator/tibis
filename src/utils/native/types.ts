export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileOptions {
  filters?: FileFilter[];
}

export interface SaveFileOptions {
  filters?: FileFilter[];
  defaultPath?: string;
}

export interface File {
  // 打开的文件路径
  path: string | null;
  // 文件内容
  content: string;
  // 文件名
  name: string;
  // 文件扩展名
  ext: string;
}

export interface Native {
  // 打开文件
  openFile(options?: OpenFileOptions): Promise<File>;

  // 保存文件
  saveFile(content: string, path?: string, options?: SaveFileOptions): Promise<string | null>;

  writeFile(path: string, content: string): Promise<void>;
  setWindowTitle(title: string): Promise<void>;
}
