/**
 * Key/value persistence adapter.
 * - Browser / tests: localStorage
 * - Electron: narrow window.srkDesktop.storage IPC (file-backed under userData/data)
 */

export type KvMode = 'local' | 'desktop' | 'uninitialized';

let mode: KvMode = 'uninitialized';
const desktopMemory = new Map<string, string>();

function assertReady(): void {
  if (mode === 'uninitialized') {
    throw new Error('KV_STORE_NOT_READY');
  }
}

function isDesktopBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.srkDesktop?.storage;
}

/**
 * Must be awaited once before any storage/auth DB access in the renderer.
 * Safe to call multiple times.
 */
export async function initKvStore(): Promise<KvMode> {
  if (mode !== 'uninitialized') return mode;

  if (isDesktopBridgeAvailable()) {
    const result = await window.srkDesktop!.storage.getAll();
    if (!result.ok || !result.data) {
      throw new Error(result.error || 'DESKTOP_STORAGE_INIT_FAILED');
    }
    desktopMemory.clear();
    for (const [key, value] of Object.entries(result.data)) {
      desktopMemory.set(key, value);
    }
    mode = 'desktop';
    return mode;
  }

  mode = 'local';
  return mode;
}

/** Test helper: force local mode with a clean memory bridge (jsdom / node mocks). */
export function resetKvStoreForTests(): void {
  mode = 'uninitialized';
  desktopMemory.clear();
}

export function getKvMode(): KvMode {
  return mode;
}

export function isDesktopKv(): boolean {
  return mode === 'desktop';
}

export function kvGetItem(key: string): string | null {
  assertReady();
  if (mode === 'desktop') {
    return desktopMemory.has(key) ? desktopMemory.get(key)! : null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    throw new Error('KV_GET_FAILED');
  }
}

export async function kvSetItem(key: string, value: string): Promise<void> {
  assertReady();
  if (mode === 'desktop') {
    const result = await window.srkDesktop!.storage.setItem(key, value);
    if (!result.ok) {
      throw new Error(result.error || 'KV_SET_FAILED');
    }
    desktopMemory.set(key, value);
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    throw new Error('KV_SET_FAILED');
  }
}

export async function kvRemoveItem(key: string): Promise<void> {
  assertReady();
  if (mode === 'desktop') {
    const result = await window.srkDesktop!.storage.removeItem(key);
    if (!result.ok) {
      throw new Error(result.error || 'KV_REMOVE_FAILED');
    }
    desktopMemory.delete(key);
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    throw new Error('KV_REMOVE_FAILED');
  }
}

export function kvKeys(): string[] {
  assertReady();
  if (mode === 'desktop') {
    return [...desktopMemory.keys()].sort();
  }
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  return keys.sort();
}
