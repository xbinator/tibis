/**
 * @file pdf-renderer.mts
 * @description HTML → PDF 渲染管道，使用隐藏 BrowserWindow 将 HTML 文档渲染为 PDF 二进制数据。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { BrowserWindow } from 'electron';

/**
 * 生成隐藏打印窗口，并将指定 HTML 渲染为 PDF 缓冲区。
 * Electron 主进程只负责通用的 HTML -> PDF 管道，不参与正文语义判断。
 * 这里使用临时 HTML 文件而非 data URL，避免大体积导出内容触发 URL 长度/合法性问题。
 * @param html - 已准备好的完整 HTML 文档
 * @returns PDF 二进制数据
 */
export async function renderPdfBufferFromHtml(html: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true
    }
  });
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'tibis-pdf-export-'));
  const tempHtmlPath = path.join(tempDirectory, 'export.html');

  try {
    await writeFile(tempHtmlPath, html, 'utf-8');
    await window.loadFile(tempHtmlPath);

    return await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally {
    window.destroy();
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
