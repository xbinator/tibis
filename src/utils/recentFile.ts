import type { StoredFile } from '@/shared/storage/files/types';

export function getRecentFileLabel(file: Pick<StoredFile, 'name' | 'content'>): string {
  const content = file.content.replace(/^\s*---[\s\S]*?---\s*\n?/, '');
  const match = /^#{1,6}\s+(.+)/m.exec(content);

  return match?.[1]?.trim() || file.name || '未命名';
}
