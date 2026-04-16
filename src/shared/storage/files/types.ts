export interface StoredFile {
  // 文件唯一值
  id: string;
  // 文件唯一路径
  path: string | null;
  // 文件内容
  content: string;
  // 最近一次与磁盘同步的内容
  savedContent?: string;
  // 文件名
  name: string;
  // 文件扩展名
  ext: string;
}
