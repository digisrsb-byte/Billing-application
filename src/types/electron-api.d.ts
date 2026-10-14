export interface SrkDesktopPaths {
  userData: string;
  appData: string;
  /** Absolute path to %APPDATA%/…/data (or platform equivalent). */
  data: string;
}

export interface SrkDesktopOpenExternalResult {
  ok: boolean;
  error?: string;
}

export interface SrkDesktopStorageResult {
  ok: boolean;
  error?: string;
  value?: string | null;
  keys?: string[];
  data?: Record<string, string>;
}

export interface SrkDesktopStorageApi {
  getAll: () => Promise<SrkDesktopStorageResult>;
  getItem: (key: string) => Promise<SrkDesktopStorageResult>;
  setItem: (key: string, value: string) => Promise<SrkDesktopStorageResult>;
  removeItem: (key: string) => Promise<SrkDesktopStorageResult>;
  listKeys: (prefix?: string) => Promise<SrkDesktopStorageResult>;
}

export interface SrkDesktopApi {
  readonly platform: string;
  getVersion: () => Promise<string>;
  getPaths: () => Promise<SrkDesktopPaths>;
  openExternal: (url: string) => Promise<SrkDesktopOpenExternalResult>;
  storage: SrkDesktopStorageApi;
}

declare global {
  interface Window {
    /** Present only when running inside the Electron shell. */
    srkDesktop?: SrkDesktopApi;
  }
}

export {};
