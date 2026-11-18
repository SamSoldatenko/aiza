// Single source of truth for every localStorage/sessionStorage key the app
// uses, and the only place that touches Web Storage directly. Callers get
// typed, named accessors instead of raw keys/JSON.parse.

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function readString(key: string): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(key);
}

function removeItem(key: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(key);
}

// --- Device-wide user preferences (theme): `aiza:prefs` -> JSON ---

const PREFS_KEY = 'aiza:prefs';

export function getPreferences<T>(fallback: T): T {
  return readJSON(PREFS_KEY, fallback);
}

export function setPreferences(prefs: unknown): void {
  writeJSON(PREFS_KEY, prefs);
}

// --- Workspace records of this device: `aiza:workspaces` -> JSON object ---
// Workspace id -> record (`{ builtInId?, type, config, presentation? }`, see
// src/workspace/registry.ts), in the order workspaces were first opened.

const WORKSPACES_KEY = 'aiza:workspaces';

export function getStoredWorkspaces(): Record<string, unknown> {
  const value = readJSON<unknown>(WORKSPACES_KEY, {});
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function setStoredWorkspaces(workspaces: Record<string, unknown>): void {
  writeJSON(WORKSPACES_KEY, workspaces);
}

// --- Last opened workspace: `aiza:last_workspace` -> JSON string ---

const LAST_WORKSPACE_KEY = 'aiza:last_workspace';

export function getLastWorkspaceId(): string | null {
  const value = readJSON<unknown>(LAST_WORKSPACE_KEY, null);
  return typeof value === 'string' ? value : null;
}

export function setLastWorkspaceId(workspaceId: string): void {
  writeJSON(LAST_WORKSPACE_KEY, workspaceId);
}

// --- Per-workspace data: `aiza:ws:{workspaceId}:{key}` -> JSON ---
// Everything a workspace keeps on the device lives under its own prefix, so
// workspaces never read each other's data and deleting one is a prefix sweep.

export interface WorkspaceStorage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  // Every key of the workspace (without the prefix) with its value.
  entries(): Record<string, unknown>;
  // Replaces everything the workspace keeps with `entries`.
  replace(entries: Record<string, unknown>): void;
  clear(): void;
}

function workspacePrefix(workspaceId: string): string {
  return `aiza:ws:${workspaceId}:`;
}

function keysWithPrefix(prefix: string): string[] {
  if (!isBrowser()) return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

export function workspaceStorage(workspaceId: string): WorkspaceStorage {
  const prefix = workspacePrefix(workspaceId);
  const clear = (): void => keysWithPrefix(prefix).forEach(removeItem);
  return {
    get: (key, fallback) => readJSON(prefix + key, fallback),
    set: (key, value) => writeJSON(prefix + key, value),
    remove: (key) => removeItem(prefix + key),
    entries: () =>
      Object.fromEntries(keysWithPrefix(prefix).map((key) => [key.slice(prefix.length), readJSON<unknown>(key, null)])),
    replace: (entries) => {
      clear();
      for (const [key, value] of Object.entries(entries)) writeJSON(prefix + key, value);
    },
    clear,
  };
}

// --- One-time cleanup of keys from the "one backend picked by URL" era ---
// `aiza_current_backend`, `aiza_backend_issuers`, `aiza_backend_history` and
// per-backend `aiza_settings:{host}`, plus the old token store and pending auth slot. The theme of the backend that was in use
// (or of any backend, if none was) carries over to `aiza:prefs`.

const LEGACY_CURRENT_BACKEND_KEY = 'aiza_current_backend';
const LEGACY_SETTINGS_PREFIX = 'aiza_settings:';
// Tokens of the old single-slot format are dropped: the user signs in once again.
const LEGACY_KEYS = [LEGACY_CURRENT_BACKEND_KEY, 'aiza_backend_issuers', 'aiza_backend_history', 'aiza_tokens', 'aiza_pending_auth'];

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function migrateLegacyStorage(): void {
  if (!isBrowser()) return;

  const settingsKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_SETTINGS_PREFIX)) settingsKeys.push(key);
  }

  if (readString(PREFS_KEY) === null && settingsKeys.length > 0) {
    const currentBackend = readString(LEGACY_CURRENT_BACKEND_KEY);
    const currentHost = currentBackend ? hostOf(currentBackend) : null;
    const preferredKey = settingsKeys.find((k) => k === LEGACY_SETTINGS_PREFIX + currentHost) ?? settingsKeys[0];
    const legacy = readJSON<{ theme?: unknown } | null>(preferredKey, null);
    if (legacy && typeof legacy.theme === 'string') {
      writeJSON(PREFS_KEY, { theme: legacy.theme });
    }
  }

  for (const key of [...LEGACY_KEYS, ...settingsKeys]) {
    removeItem(key);
  }
}

// --- Identity sessions: `aiza:auth:sessions` -> JSON object ---
// One entry per identity (issuer + client id): the session (src/auth/session.ts)
// with its id token claims and one grant (refresh and access token) per set of
// scopes. Read fresh on every access, so a refresh done by another tab is
// picked up.

const AUTH_SESSIONS_KEY = 'aiza:auth:sessions';

export function getAuthSessions<T>(): Record<string, T> {
  const value = readJSON<unknown>(AUTH_SESSIONS_KEY, {});
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, T>) : {};
}

export function setAuthSessions(sessions: Record<string, unknown>): void {
  writeJSON(AUTH_SESSIONS_KEY, sessions);
}

// --- Pending sign-in flows (sessionStorage): `aiza:pending_auth:{state}` -> JSON ---
// Keyed by the OAuth `state`, so parallel sign-ins (two tabs, two identities)
// don't overwrite each other. sessionStorage survives the redirect to the IdP
// and back within the same tab.

const PENDING_AUTH_PREFIX = 'aiza:pending_auth:';

export function setPendingAuth(state: string, auth: unknown): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(PENDING_AUTH_PREFIX + state, JSON.stringify(auth));
}

// Reads and removes: a pending flow can be completed only once.
export function takePendingAuth<T>(state: string): T | null {
  if (!isBrowser()) return null;
  const key = PENDING_AUTH_PREFIX + state;
  const raw = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Drops abandoned flows (user never came back from the IdP).
export function sweepPendingAuth(isExpired: (auth: unknown) => boolean): void {
  if (!isBrowser()) return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(PENDING_AUTH_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    let auth: unknown = null;
    try {
      auth = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    } catch {
      // unreadable entry: treat as expired
    }
    if (auth === null || isExpired(auth)) sessionStorage.removeItem(key);
  }
}

// --- Last stale-chunk reload (sessionStorage): `aiza_chunk_reload_at` -> epoch ms ---
// Per-tab on purpose: it only guards one tab against a reload loop.

const CHUNK_RELOAD_AT_KEY = 'aiza_chunk_reload_at';

export function getLastChunkReloadAt(): number | null {
  if (!isBrowser()) return null;
  const raw = sessionStorage.getItem(CHUNK_RELOAD_AT_KEY);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function setLastChunkReloadAt(timestamp: number): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(timestamp));
}
