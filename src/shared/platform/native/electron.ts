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
  ReadWorkspaceDirectoryResult,
  TibisWorkspaceRoot
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

  async getCwd(): Promise<string> {
    return getElectronAPI().getCwd();
  }

  async getHomeDir(): Promise<string> {
    return getElectronAPI().getHomeDir();
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

  async watchDirectory(dirPath: string, globPattern?: string): Promise<void> {
    await getElectronAPI().watchDirectory(dirPath, globPattern);
  }

  async unwatchDirectory(dirPath: string, globPattern?: string): Promise<void> {
    await getElectronAPI().unwatchDirectory(dirPath, globPattern);
  }

  onSkillChanged(callback: (data: { type: string; filePath: string; content?: string }) => void): () => void {
    return getElectronAPI().onSkillChanged(callback);
  }

  async setWindowTitle(title: string): Promise<void> {
    await getElectronAPI().setWindowTitle(title);
  }

  async openExternal(url: string): Promise<void> {
    await getElectronAPI().openExternal(url);
  }

  supportsShellCommand(): boolean {
    return true;
  }

  async getTibisWorkspaceRoot(): Promise<TibisWorkspaceRoot | null> {
    return getElectronAPI().getTibisWorkspaceRoot();
  }

  async analyzeShellCommand(request: Parameters<Native['analyzeShellCommand']>[0]): ReturnType<Native['analyzeShellCommand']> {
    return getElectronAPI().analyzeShellCommand(request);
  }

  async runShellCommand(request: Parameters<Native['runShellCommand']>[0]): ReturnType<Native['runShellCommand']> {
    return getElectronAPI().runShellCommand(request);
  }

  async cancelShellCommand(commandId: string): Promise<boolean> {
    return getElectronAPI().cancelShellCommand(commandId);
  }

  onShellCommandOutput(callback: Parameters<Native['onShellCommandOutput']>[0]): () => void {
    return getElectronAPI().onShellCommandOutput(callback);
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
