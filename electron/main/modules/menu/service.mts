import { app, Menu, MenuItemConstructorOptions, BrowserWindow } from 'electron';

export function setupAppMenu(): void {
  const isMac = process.platform === 'darwin';

  if (!isMac) {
    Menu.setApplicationMenu(null);
    return;
  }

  const sendAction = (action: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('menu:action', action);
    }
  };

  const template: MenuItemConstructorOptions[] = [
    // { role: 'appMenu' }
    {
      label: app.name,
      submenu: [
        { role: 'about' as const, label: `关于 ${app.name}` },
        { type: 'separator' as const },
        { role: 'services' as const, label: '服务' },
        { type: 'separator' as const },
        { role: 'hide' as const, label: `隐藏 ${app.name}` },
        { role: 'hideOthers' as const, label: '隐藏其他' },
        { role: 'unhide' as const, label: '全部显示' },
        { type: 'separator' as const },
        { role: 'quit' as const, label: `退出 ${app.name}` }
      ]
    },
    // { role: 'fileMenu' }
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+Alt+N', click: () => sendAction('file:new') },
        { type: 'separator' as const },
        { label: '打开...', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendAction('file:open') },
        { type: 'separator' as const },
        { label: '复制为新文件', accelerator: 'CmdOrCtrl+Alt+D', click: () => sendAction('file:duplicate') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendAction('file:save') },
        { label: '另存为...', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendAction('file:saveAs') },
        { type: 'separator' as const },
        { label: '重命名', accelerator: 'F2', click: () => sendAction('file:rename') },
        { type: 'separator' as const },
        { label: '清空内容', click: () => sendAction('file:clear-content') },
        { label: '从最近记录移除当前', click: () => sendAction('file:remove-current') },
        { type: 'separator' as const },
        { role: 'close' as const, label: '关闭' }
      ]
    },
    // { role: 'editMenu' }
    {
      label: '编辑',
      submenu: [
        { role: 'undo' as const, label: '撤销', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo' as const, label: '重做', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: '剪切', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy' as const, label: '复制', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste' as const, label: '粘贴', accelerator: 'CmdOrCtrl+V' },
        { role: 'pasteAndMatchStyle' as const, label: '粘贴并匹配样式', accelerator: 'CmdOrCtrl+Shift+V' },
        { role: 'delete' as const, label: '删除' },
        { role: 'selectAll' as const, label: '全选', accelerator: 'CmdOrCtrl+A' },
        { type: 'separator' as const },
        { label: '复制为纯文本', click: () => sendAction('edit:copy-plain-text') },
        { label: '复制为 Markdown', click: () => sendAction('edit:copy-markdown') },
        { label: '复制为 HTML 代码', click: () => sendAction('edit:copy-html') },
        { type: 'separator' as const },
        {
          label: '语音',
          submenu: [
            { role: 'startSpeaking' as const, label: '开始朗读' },
            { role: 'stopSpeaking' as const, label: '停止朗读' }
          ]
        }
      ]
    },
    // { role: 'viewMenu' }
    {
      label: '视图',
      submenu: [
        { id: 'view:source', type: 'checkbox', label: '源代码模式', accelerator: 'CmdOrCtrl+E', click: () => sendAction('view:source') },
        { id: 'view:outline', type: 'checkbox', label: '大纲', click: () => sendAction('view:outline') },
        { type: 'separator' as const },
        {
          label: '主题',
          submenu: [
            { id: 'theme:light', type: 'checkbox', label: '浅色模式', click: () => sendAction('theme:light') },
            { id: 'theme:dark', type: 'checkbox', label: '深色模式', click: () => sendAction('theme:dark') },
            { id: 'theme:system', type: 'checkbox', label: '跟随系统', click: () => sendAction('theme:system') }
          ]
        },
        { type: 'separator' as const },
        { role: 'reload' as const, label: '重新加载' },
        { role: 'forceReload' as const, label: '强制重新加载' },
        { role: 'toggleDevTools' as const, label: '切换开发者工具' },
        { type: 'separator' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: '切换全屏' }
      ]
    },
    // { role: 'windowMenu' }
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' as const, label: '最小化' },
        { role: 'zoom' as const, label: '缩放' },
        { type: 'separator' as const },
        { role: 'front' as const, label: '前置全部窗口' },
        { type: 'separator' as const },
        { role: 'window' as const, label: '窗口' }
      ]
    },
    {
      label: '帮助',
      submenu: [{ label: '快捷键', accelerator: 'CmdOrCtrl+/', click: () => sendAction('help:shortcuts') }]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
