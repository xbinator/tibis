import type { File, Native } from './types';
import { ElectronNative } from './electron';
import { WebNative } from './web';

export { File };

export const native: Native = new ElectronNative();

export const web = new WebNative();
