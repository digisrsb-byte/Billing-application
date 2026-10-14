'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Channel names must stay in sync with electron/ipc-channels.cjs.
 * Sandboxed preloads cannot reliably require sibling local modules, so
 * constants are duplicated here instead of imported.
 */
const CHANNELS = Object.freeze({
  GET_VERSION: 'srk:app:getVersion',
  GET_PATHS: 'srk:app:getPaths',
  OPEN_EXTERNAL: 'srk:app:openExternal',
  STORAGE_GET_ALL: 'srk:storage:getAll',
  STORAGE_GET: 'srk:storage:get',
  STORAGE_SET: 'srk:storage:set',
  STORAGE_REMOVE: 'srk:storage:remove',
  STORAGE_LIST: 'srk:storage:list',
});

/**
 * Minimal desktop bridge for the renderer.
 * No Node, fs, path, or raw ipcRenderer exposure.
 */
contextBridge.exposeInMainWorld(
  'srkDesktop',
  Object.freeze({
    platform: process.platform,
    getVersion: () => ipcRenderer.invoke(CHANNELS.GET_VERSION),
    getPaths: () => ipcRenderer.invoke(CHANNELS.GET_PATHS),
    openExternal: (url) => ipcRenderer.invoke(CHANNELS.OPEN_EXTERNAL, url),
    storage: Object.freeze({
      getAll: () => ipcRenderer.invoke(CHANNELS.STORAGE_GET_ALL),
      getItem: (key) => ipcRenderer.invoke(CHANNELS.STORAGE_GET, { key }),
      setItem: (key, value) => ipcRenderer.invoke(CHANNELS.STORAGE_SET, { key, value }),
      removeItem: (key) => ipcRenderer.invoke(CHANNELS.STORAGE_REMOVE, { key }),
      listKeys: (prefix) => ipcRenderer.invoke(CHANNELS.STORAGE_LIST, { prefix }),
    }),
  })
);
