'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const KEY_RE = /^srk_[A-Za-z0-9_]{1,180}$/;
const MAX_VALUE_BYTES = 20 * 1024 * 1024;
const MAX_AUTO_BACKUPS = 10;
const LIVE_DB_KEY = 'srk_enterprises_billing_db_v2';

/**
 * @param {unknown} parsed
 * @returns {boolean}
 */
function isDatabaseShape(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = /** @type {Record<string, unknown>} */ (parsed);
  if (!Array.isArray(obj.clients)) return false;
  if (!Array.isArray(obj.invoices)) return false;
  if (!obj.settings || typeof obj.settings !== 'object') return false;
  return true;
}

/**
 * @param {unknown} key
 * @returns {asserts key is string}
 */
function assertValidKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) {
    const err = new Error('INVALID_STORAGE_KEY');
    err.code = 'INVALID_STORAGE_KEY';
    throw err;
  }
}

/**
 * @param {unknown} value
 * @returns {asserts value is string}
 */
function assertValidValue(value) {
  if (typeof value !== 'string') {
    const err = new Error('INVALID_STORAGE_VALUE');
    err.code = 'INVALID_STORAGE_VALUE';
    throw err;
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
    const err = new Error('STORAGE_VALUE_TOO_LARGE');
    err.code = 'STORAGE_VALUE_TOO_LARGE';
    throw err;
  }
}

/**
 * Create a file-backed key/value store under userData/data.
 * @param {{ rootDir: string }} options
 */
function createDataStore(options) {
  if (!options || typeof options.rootDir !== 'string' || !options.rootDir) {
    throw new Error('DATA_STORE_ROOT_REQUIRED');
  }

  const rootDir = path.resolve(options.rootDir);
  const storeDir = path.join(rootDir, 'store');
  const backupDir = path.join(rootDir, 'backups', 'auto');
  const liveDbPath = path.join(rootDir, 'db.json');
  const liveDbBakPath = path.join(rootDir, 'db.json.bak');

  /** @type {Map<string, string>} */
  const memory = new Map();
  let writeChain = Promise.resolve();
  let ready = false;

  function enqueue(task) {
    const run = writeChain.then(task, task);
    writeChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function pathForKey(key) {
    assertValidKey(key);
    if (key === LIVE_DB_KEY) return liveDbPath;
    return path.join(storeDir, `${key}.json`);
  }

  /**
   * Atomic replace: write tmp → rotate existing to .bak → rename tmp into place.
   * Never deletes the only copy of existing data before the new file is durable.
   * @param {string} targetPath
   * @param {string} contents
   */
  async function atomicWriteFile(targetPath, contents) {
    const dir = path.dirname(targetPath);
    await fsp.mkdir(dir, { recursive: true });
    const tmpPath = `${targetPath}.${process.pid}.tmp`;
    await fsp.writeFile(tmpPath, contents, 'utf8');

    try {
      await fsp.access(targetPath, fs.constants.F_OK);
      // Preserve last-good beside target when writing live db; for store keys use sibling .bak
      const bakPath = targetPath === liveDbPath ? liveDbBakPath : `${targetPath}.bak`;
      await fsp.rm(bakPath, { force: true });
      await fsp.rename(targetPath, bakPath);
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err;
    }

    await fsp.rename(tmpPath, targetPath);
  }

  async function rotateAutoBackup(contents) {
    await fsp.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `db-${stamp}.json`);
    await fsp.writeFile(dest, contents, 'utf8');

    const entries = (await fsp.readdir(backupDir))
      .filter((name) => name.startsWith('db-') && name.endsWith('.json'))
      .sort();
    while (entries.length > MAX_AUTO_BACKUPS) {
      const oldest = entries.shift();
      if (!oldest) break;
      await fsp.rm(path.join(backupDir, oldest), { force: true });
    }
  }

  async function readFileIfExists(filePath) {
    try {
      return await fsp.readFile(filePath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async function hydrate() {
    await fsp.mkdir(storeDir, { recursive: true });
    await fsp.mkdir(backupDir, { recursive: true });
    memory.clear();

    const live = await readFileIfExists(liveDbPath);
    if (live != null) {
      memory.set(LIVE_DB_KEY, live);
    }

    let names = [];
    try {
      names = await fsp.readdir(storeDir);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }

    for (const name of names) {
      if (!name.endsWith('.json') || name.endsWith('.bak.json')) continue;
      if (name.endsWith('.tmp')) continue;
      const key = name.slice(0, -'.json'.length);
      if (!KEY_RE.test(key) || key === LIVE_DB_KEY) continue;
      const raw = await readFileIfExists(path.join(storeDir, name));
      if (raw != null) memory.set(key, raw);
    }

    ready = true;
    return {
      rootDir,
      keyCount: memory.size,
      hasLiveDb: memory.has(LIVE_DB_KEY),
    };
  }

  function ensureReady() {
    if (!ready) {
      const err = new Error('DATA_STORE_NOT_READY');
      err.code = 'DATA_STORE_NOT_READY';
      throw err;
    }
  }

  function getItem(key) {
    ensureReady();
    assertValidKey(key);
    return memory.has(key) ? memory.get(key) : null;
  }

  function getAll() {
    ensureReady();
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of memory.entries()) out[k] = v;
    return out;
  }

  function listKeys(prefix) {
    ensureReady();
    const keys = [...memory.keys()].sort();
    if (prefix == null || prefix === '') return keys;
    if (typeof prefix !== 'string' || prefix.length > 200) {
      const err = new Error('INVALID_PREFIX');
      err.code = 'INVALID_PREFIX';
      throw err;
    }
    return keys.filter((k) => k.startsWith(prefix));
  }

  /**
   * @param {string} key
   * @param {string} value
   * @param {{ skipShapeValidation?: boolean }} [opts]
   */
  async function setItem(key, value, opts = {}) {
    ensureReady();
    assertValidKey(key);
    assertValidValue(value);

    const isLiveDb = key === LIVE_DB_KEY;
    const skipShape = Boolean(opts.skipShapeValidation);
    // Salvage / pre_restore / backup keys may hold corrupt or marker text.
    const opaque =
      key.includes('_salvage_') ||
      key.includes('_pre_restore_') ||
      key.includes('_backup_');
    const isDbKey =
      isLiveDb ||
      key === 'srk_enterprises_billing_db_TEST_p0' ||
      /^srk_enterprises_billing_db_[A-Za-z0-9_]+$/.test(key);

    if (!opaque && !skipShape && isDbKey) {
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        const shapeErr = new Error('INVALID_DATABASE_JSON');
        shapeErr.code = 'INVALID_DATABASE_JSON';
        throw shapeErr;
      }
      if (!isDatabaseShape(parsed)) {
        const err = new Error('INVALID_DATABASE_SHAPE');
        err.code = 'INVALID_DATABASE_SHAPE';
        throw err;
      }
    }

    return enqueue(async () => {
      const target = pathForKey(key);
      await atomicWriteFile(target, value);
      if (isLiveDb) {
        try {
          await rotateAutoBackup(value);
        } catch {
          // Auto-backup failure must not roll back a successful live write.
        }
      }
      memory.set(key, value);
    });
  }

  async function removeItem(key) {
    ensureReady();
    assertValidKey(key);
    return enqueue(async () => {
      const target = pathForKey(key);
      await fsp.rm(target, { force: true });
      memory.delete(key);
    });
  }

  return {
    LIVE_DB_KEY,
    rootDir,
    hydrate,
    getItem,
    getAll,
    listKeys,
    setItem,
    removeItem,
    /** @internal test helpers */
    _pathForKey: pathForKey,
    _memory: memory,
  };
}

module.exports = {
  createDataStore,
  KEY_RE,
  MAX_VALUE_BYTES,
  LIVE_DB_KEY,
  isDatabaseShape,
  assertValidKey,
  assertValidValue,
};
