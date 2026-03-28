import type { File } from './types';
import { isTauri } from '../is';
import { TauriNative } from './tauri';
import { WebNative } from './web';

export { File };

export const native = isTauri() ? new TauriNative() : new WebNative();
