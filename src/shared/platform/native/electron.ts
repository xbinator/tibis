/* eslint-disable class-methods-use-this */
import type {
  Native,
  ExportPdfOptions,
  FilePathStatus,
  OpenFileOptions,
  SaveFileOptions,
  FileChangeEvent,
  ReadFileResult,
  ReadWorkspaceFileOptions,
  ReadWorkspaceFileResult,
  ReadWorkspaceDirectoryOptions,
  ReadWorkspaceDirectoryResult
} from './types';
import type { RecentFileShortcutInput } from 'types/electron-api';
import { OPEN_FILE_FILTER, SAVE_FILE_FILTER } from '@/constants/extensions';
import { getElectronAPI } from '../electron-api';

export class ElectronNative implements Native {
  async readFile(filePath: string): Promise<ReadFileResult> {
    const result = await getElectronAPI().readFile(filePath);
    return { content: result.content, name: result.fileName, ext: result.ext };
  }

  async getPathStatus(filePath: string): Promise<FilePathStatus> {
    const { getPathStatus } = getElectronAPI();

    if (!getPathStatus) {
      return {
        exists: false,
        isFile: false,
        isDirectory: false
      };
    }

    return getPathStatus(filePath);
  }

  async readWorkspaceFile(options: ReadWorkspaceFileOptions): Promise<ReadWorkspaceFileResult> {
    return getElectronAPI().readWorkspaceFile(options);
  }

  async readWorkspaceDirectory(options: ReadWorkspaceDirectoryOptions): Promise<ReadWorkspaceDirectoryResult> {
    return getElectronAPI().readWorkspaceDirectory(options);
  }

  async openFile(options?: OpenFileOptions) {
    const filters = options?.filters || [OPEN_FILE_FILTER];
    const result = await getElectronAPI().openFile({ filters });

    if (result.canceled || !result.filePath) {
      return { id: '', path: null, content: '', name: '', ext: '' };
    }

    const fileName = result.fileName || '';
    const [, name, ext] = /^(.+?)(?:\.([^.]+))?$/.exec(fileName) || ['', '', ''];

    return { id: '', path: result.filePath, content: result.content, name, ext };
  }

  async saveFile(content: string, path?: string, options?: SaveFileOptions) {
    const filters = options?.filters || [SAVE_FILE_FILTER];
    const defaultPath = options?.defaultPath || 'untitled.md';

    return getElectronAPI().saveFile(content, path, { filters, defaultPath });
  }

  async exportPdf(options: ExportPdfOptions): Promise<string | null> {
    return getElectronAPI().exportPdf(options);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await getElectronAPI().writeFile(filePath, content);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await getElectronAPI().renameFile(oldPath, newPath);
  }

  async trashFile(filePath: string): Promise<void> {
    await getElectronAPI().trashFile(filePath);
  }

  async showItemInFolder(filePath: string): Promise<void> {
    await getElectronAPI().showItemInFolder(filePath);
  }

  async getRelativePath(filePath: string): Promise<string> {
    return getElectronAPI().getRelativePath(filePath);
  }

  async watchFile(filePath: string): Promise<void> {
    await getElectronAPI().watchFile(filePath);
  }

  async unwatchFile(filePath: string): Promise<void> {
    await getElectronAPI().unwatchFile(filePath);
  }

  async unwatchAll(): Promise<void> {
    await getElectronAPI().unwatchAll();
  }

  onFileChanged(callback: (data: FileChangeEvent) => void): () => void {
    return getElectronAPI().onFileChanged(callback);
  }

  async setWindowTitle(title: string): Promise<void> {
    await getElectronAPI().setWindowTitle(title);
  }

  async openExternal(url: string): Promise<void> {
    await getElectronAPI().openExternal(url);
  }

  updateMenuItem(id: string, properties: { checked?: boolean }): void {
    getElectronAPI().updateMenuItem(id, properties);
  }

  onMenuAction(callback: (action: string) => void): () => void {
    return getElectronAPI().onMenuAction(callback);
  }

  async syncRecentFiles(files: RecentFileShortcutInput[]): Promise<void> {
    await getElectronAPI().syncRecentFiles(files);
  }
}
