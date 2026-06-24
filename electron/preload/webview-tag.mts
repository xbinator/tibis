/**
 * @file webview-tag.mts
 * @description `<webview>` 标签访客页 preload，仅暴露页面到宿主的受控消息桥。
 */
import { contextBridge, ipcRenderer } from 'electron';
import { TIBIS_WEBVIEW_HOST_CHANNEL } from '../../shared/webview/host-bridge.js';

/**
 * WebView 访客页可访问的宿主消息桥。
 */
interface TibisWebviewHostBridge {
  /**
   * 向宿主页面发送结构化消息。
   * @param channel - 消息通道
   * @param payload - 消息负载
   */
  postMessage(channel: string, payload: unknown): void;
}

/**
 * 判断通道是否允许发送给宿主页面。
 * @param channel - 消息通道
 * @returns 是否为允许通道
 */
function isAllowedHostChannel(channel: string): boolean {
  return channel === TIBIS_WEBVIEW_HOST_CHANNEL;
}

const bridge: TibisWebviewHostBridge = {
  postMessage(channel: string, payload: unknown): void {
    if (!isAllowedHostChannel(channel)) {
      return;
    }

    ipcRenderer.sendToHost(channel, payload);
  }
};

contextBridge.exposeInMainWorld('__tibisWebviewHost', bridge);
