'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const CHANNELS = require('./ipc-channels.cjs');
const { createDataStore } = require('./dataStore.cjs');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {ReturnType<typeof createDataStore> | null} */
let dataStore = null;

const DEV_SERVER_URL = process.env.ELECTRON_START_URL || '';
const isDevServer = Boolean(DEV_SERVER_URL);

function isSafeHttpsUrl(candidate) {
  if (typeof candidate !== 'string' || candidate.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedNavigation(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (isDevServer) {
      const allowed = new URL(DEV_SERVER_URL);
      return parsed.protocol === allowed.protocol && parsed.host === allowed.host;
    }
    return parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function ipcError(code) {
  return { ok: false, error: code };
}

function registerIpcHandlers() {
  ipcMain.handle(CHANNELS.GET_VERSION, () => app.getVersion());

  ipcMain.handle(CHANNELS.GET_PATHS, () => ({
    userData: app.getPath('userData'),
    appData: app.getPath('appData'),
    data: dataStore ? dataStore.rootDir : path.join(app.getPath('userData'), 'data'),
  }));

  ipcMain.handle(CHANNELS.OPEN_EXTERNAL, async (_event, url) => {
    if (!isSafeHttpsUrl(url)) {
      return { ok: false, error: 'Only https:// URLs are allowed.' };
    }
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Failed to open external URL.' };
    }
  });

  ipcMain.handle(CHANNELS.STORAGE_GET_ALL, async () => {
    if (!dataStore) return ipcError('DATA_STORE_NOT_READY');
    try {
      return { ok: true, data: dataStore.getAll() };
    } catch (err) {
      return ipcError(err && err.code ? err.code : 'STORAGE_GET_ALL_FAILED');
    }
  });

  ipcMain.handle(CHANNELS.STORAGE_GET, async (_event, payload) => {
    if (!dataStore) return ipcError('DATA_STORE_NOT_READY');
    try {
      const key = payload && payload.key;
      return { ok: true, value: dataStore.getItem(key) };
    } catch (err) {
      return ipcError(err && err.code ? err.code : 'STORAGE_GET_FAILED');
    }
  });

  ipcMain.handle(CHANNELS.STORAGE_SET, async (_event, payload) => {
    if (!dataStore) return ipcError('DATA_STORE_NOT_READY');
    try {
      const key = payload && payload.key;
      const value = payload && payload.value;
      await dataStore.setItem(key, value);
      return { ok: true };
    } catch (err) {
      return ipcError(err && err.code ? err.code : 'STORAGE_SET_FAILED');
    }
  });

  ipcMain.handle(CHANNELS.STORAGE_REMOVE, async (_event, payload) => {
    if (!dataStore) return ipcError('DATA_STORE_NOT_READY');
    try {
      const key = payload && payload.key;
      await dataStore.removeItem(key);
      return { ok: true };
    } catch (err) {
      return ipcError(err && err.code ? err.code : 'STORAGE_REMOVE_FAILED');
    }
  });

  ipcMain.handle(CHANNELS.STORAGE_LIST, async (_event, payload) => {
    if (!dataStore) return ipcError('DATA_STORE_NOT_READY');
    try {
      const prefix = payload && payload.prefix;
      return { ok: true, keys: dataStore.listKeys(prefix) };
    } catch (err) {
      return ipcError(err && err.code ? err.code : 'STORAGE_LIST_FAILED');
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'SRK Enterprises Billing',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeHttpsUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDevServer) {
    return mainWindow.loadURL(DEV_SERVER_URL);
  }

  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
  return mainWindow.loadFile(indexHtml);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.whenReady().then(async () => {
    dataStore = createDataStore({
      rootDir: path.join(app.getPath('userData'), 'data'),
    });
    await dataStore.hydrate();
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      } else {
        focusMainWindow();
      }
    });
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    contents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeHttpsUrl(url)) {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
