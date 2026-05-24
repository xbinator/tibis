import { registerAIHandlers } from './ai/ipc.mjs';
import { registerDatabaseHandlers } from './database/ipc.mjs';
import { registerDialogHandlers } from './dialog/ipc.mjs';
import { registerFileHandlers } from './file/ipc.mjs';
import { registerImageHandlers } from './image/ipc.mjs';
import { registerLoggerHandlers, registerLogFileHandlers } from './logger/ipc.mjs';
import { registerMcpHandlers } from './mcp/ipc.mjs';
import { registerMenuHandlers } from './menu/ipc.mjs';
import { registerSystemHandlers } from './system/ipc.mjs';
import { registerShellCommandHandlers } from './shell-command/ipc.mjs';
import { registerShortcutHandlers } from './shortcuts/ipc.mjs';
import { registerSpeechHandlers } from './speech/ipc.mjs';
import { registerStoreHandlers } from './store/ipc.mjs';
import { registerWebviewHandlers } from './webview/ipc.mjs';
import { registerWindowHandlers } from './window/ipc.mjs';

export function registerAllIpcHandlers() {
  registerDialogHandlers();
  registerFileHandlers();
  registerWindowHandlers();
  registerDatabaseHandlers();
  registerStoreHandlers();
  registerSystemHandlers();
  registerShellCommandHandlers();
  registerAIHandlers();
  registerMcpHandlers();
  registerLoggerHandlers();
  registerLogFileHandlers();
  registerMenuHandlers();
  registerShortcutHandlers();
  registerWebviewHandlers();
  registerImageHandlers();
  registerSpeechHandlers();
}

export {
  registerDialogHandlers,
  registerFileHandlers,
  registerWindowHandlers,
  registerDatabaseHandlers,
  registerStoreHandlers,
  registerSystemHandlers,
  registerShellCommandHandlers,
  registerAIHandlers,
  registerMcpHandlers,
  registerLoggerHandlers,
  registerShortcutHandlers,
  registerWebviewHandlers,
  registerLogFileHandlers,
  registerImageHandlers,
  registerSpeechHandlers
};

export { aiService } from './ai/service.mjs';

export { initLogger, initMainErrorCollector, log, cleanOldLogs, startLogMaintenanceTimer } from './logger/service.mjs';

export { initDatabase, closeDatabase, dbExecute, dbSelect, getDbPath } from './database/service.mjs';

export { initStore, getStore } from './store/service.mjs';

export { setupAppMenu, sendMenuAction } from './menu/service.mjs';

export { getShortcutActionFromArgv, refreshShortcuts, setShortcutActionSender } from './shortcuts/service.mjs';
