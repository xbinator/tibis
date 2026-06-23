/**
 * @file types.ts
 * @description WebView 自动化内部类型。
 */

/**
 * 当前有效快照中的元素身份信息。
 */
export interface ActiveWebviewSnapshotElement {
  /** 本次快照内元素索引。 */
  index: number;
  /** 元素标签名。 */
  tagName: string;
  /** 模型可读标签。 */
  label: string;
  /** 元素身份指纹。 */
  fingerprint?: string;
}
