'use strict';

/**
 * Narrow IPC channel allowlist used by main.
 * Keep string values in sync with electron/preload.cjs (sandboxed preload
 * cannot require this file).
 * Do not add filesystem or generic invoke channels here.
 */
module.exports = Object.freeze({
  GET_VERSION: 'srk:app:getVersion',
  GET_PATHS: 'srk:app:getPaths',
  OPEN_EXTERNAL: 'srk:app:openExternal',
  STORAGE_GET_ALL: 'srk:storage:getAll',
  STORAGE_GET: 'srk:storage:get',
  STORAGE_SET: 'srk:storage:set',
  STORAGE_REMOVE: 'srk:storage:remove',
  STORAGE_LIST: 'srk:storage:list',
});
