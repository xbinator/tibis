import localforage from 'localforage';

localforage.config({ name: 'Texti', storeName: 'files', description: 'Texti 笔记应用文件存储' });

export interface StoredFile {
  id: string;
  path: string | null;
  content: string;
  name: string;
  ext: string;
}

const RECENT_FILES_KEY = 'recent_files';

const CURRENT_FILE_ID_KEY = 'current_file_id';

const MAX_RECENT_FILES = 100;

export const indexedDB = {
  async addRecentFile(file: StoredFile): Promise<void> {
    const files = await this.getAllRecentFiles();

    const filtered = files.filter((f) => f.id !== file.id);

    filtered.unshift({ ...file });

    await localforage.setItem(RECENT_FILES_KEY, filtered.slice(0, MAX_RECENT_FILES));
  },

  async getAllRecentFiles(): Promise<StoredFile[]> {
    const files = await localforage.getItem<StoredFile[]>(RECENT_FILES_KEY);
    return files || [];
  },

  async getRecentFile(id: string): Promise<StoredFile | null> {
    const files = await this.getAllRecentFiles();
    return files.find((f) => f.id === id) || null;
  },

  async updateRecentFile(id: string, file: StoredFile): Promise<void> {
    const files = await this.getAllRecentFiles();
    const index = files.findIndex((f) => f.id === id);
    if (index !== -1) {
      files[index] = { ...file };

      await localforage.setItem(RECENT_FILES_KEY, files);
    }
  },

  async removeRecentFile(...ids: string[]): Promise<void> {
    const files = await this.getAllRecentFiles();
    const filtered = files.filter((f) => !ids.includes(f.id));
    await localforage.setItem(RECENT_FILES_KEY, filtered);
  },

  async clearRecentFiles(): Promise<void> {
    await localforage.setItem(RECENT_FILES_KEY, []);
  },

  async setCurrentFile(id: string): Promise<void> {
    await localforage.setItem(CURRENT_FILE_ID_KEY, id);
  },

  async getCurrentFileId(): Promise<string | null> {
    return localforage.getItem<string>(CURRENT_FILE_ID_KEY);
  },

  async clearCurrentFile(): Promise<void> {
    await localforage.removeItem(CURRENT_FILE_ID_KEY);
  },

  async clear(): Promise<void> {
    await localforage.clear();
  }
};
