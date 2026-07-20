/**
 * @file types.mts
 * @description Shell PTY 屏幕快照、提示区域与自动交互内部类型。
 */

/** 当前终端画面的活动输出信号。 */
export interface ShellScreenActivity {
  /** 是否检测到旋转动画。 */
  spinner: boolean;
  /** 是否检测到下载或进度输出。 */
  progress: boolean;
  /** 是否检测到编译输出。 */
  compiling: boolean;
  /** 是否检测到持续日志。 */
  streamingLogs: boolean;
}

/** Headless terminal 投影出的当前屏幕。 */
export interface ShellScreenSnapshot {
  /** 单调递增快照序号。 */
  sequence: number;
  /** 当前可见终端纯文本。 */
  content: string;
  /** 当前光标状态。 */
  cursor: { row: number; column: number; visible: boolean };
  /** 当前默认选项索引。 */
  selectedIndex?: number;
  /** 活动输出信号。 */
  activity: ShellScreenActivity;
  /** 单调时间戳。 */
  createdAt: number;
}

/** 参与提示判断和 checkpoint 哈希的稳定区域。 */
export interface StablePromptRegion {
  /** 规范化提示文本。 */
  content: string;
  /** 提示区域对应光标状态。 */
  cursor: { row: number; column: number; visible: boolean };
  /** 当前默认选项索引。 */
  selectedIndex?: number;
  /** 稳定内容哈希。 */
  screenHash: string;
}
