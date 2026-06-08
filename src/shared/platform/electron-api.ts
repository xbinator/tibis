import type { ElectronAPI } from 'types/electron-api';

export type {
  ChatHandlerResult,
  DbExecuteResult,
  ElectronAPI,
  ElectronDialogFilter,
  ElectronExportPdfOptions,
  ElectronFileResult,
  ElectronOpenFileOptions,
  ElectronReadWorkspaceFileOptions,
  ElectronReadWorkspaceFileResult,
  ElectronSaveFileOptions,
  ElectronUpdateCheckResult
} from 'types/electron-api';

function readElectronAPI(): ElectronAPI | undefined {
  return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

export const hasElectronAPI = (): boolean => readElectronAPI() !== undefined;

export function getElectronAPI(): ElectronAPI {
  const api = readElectronAPI();

  if (!api) throw new Error('Electron API is not available');

  return api;
}

export function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string; code: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
