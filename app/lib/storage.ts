// Single source of truth for every localStorage key the app uses, and the
// only place that touches `localStorage` directly. Callers get typed,
// named accessors instead of raw keys/JSON.parse.

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

function writeString(key: string, value: string): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, value);
}

function removeItem(key: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(key);
}

// --- Current backend URL: `aiza_current_backend` -> plain string ---

const CURRENT_BACKEND_KEY = 'aiza_current_backend';

export function getCurrentBackendUrl(): string | null {
  return readString(CURRENT_BACKEND_KEY);
}

export function setCurrentBackendUrl(url: string): void {
  writeString(CURRENT_BACKEND_KEY, url);
}

// --- Per-server settings: `aiza_settings:{serverId}` -> JSON ---

function settingsKey(serverId: string): string {
  return `aiza_settings:${serverId}`;
}

export function getServerSettings<T>(serverId: string, fallback: T): T {
  return readJSON(settingsKey(serverId), fallback);
}

export function setServerSettings(serverId: string, settings: unknown): void {
  writeJSON(settingsKey(serverId), settings);
}

// --- Cached backend URL -> JWT issuer bindings: `aiza_backend_issuers` -> JSON ---

const CACHED_ISSUERS_KEY = 'aiza_backend_issuers';

export function getCachedIssuers(): Record<string, string> {
  return readJSON(CACHED_ISSUERS_KEY, {});
}

export function setCachedIssuers(issuers: Record<string, string>): void {
  writeJSON(CACHED_ISSUERS_KEY, issuers);
}

// --- Custom backend history: `aiza_backend_history` -> JSON array ---

const BACKEND_HISTORY_KEY = 'aiza_backend_history';

export function getBackendHistory(): string[] {
  return readJSON(BACKEND_HISTORY_KEY, []);
}

export function addBackendToHistory(url: string): void {
  const history = getBackendHistory();
  if (!history.includes(url)) {
    writeJSON(BACKEND_HISTORY_KEY, [...history, url]);
  }
}

// --- OAuth tokens: `aiza_tokens` -> JSON array ---

const TOKENS_KEY = 'aiza_tokens';

export function getStoredTokens<T>(): T[] {
  return readJSON(TOKENS_KEY, []);
}

export function setStoredTokens(tokens: unknown[]): void {
  writeJSON(TOKENS_KEY, tokens);
}

// --- Pending PKCE auth flow: `aiza_pending_auth` -> JSON, cleared after callback ---

const PENDING_AUTH_KEY = 'aiza_pending_auth';

export function getPendingAuth<T>(): T | null {
  return readJSON(PENDING_AUTH_KEY, null);
}

export function setPendingAuth(auth: unknown): void {
  writeJSON(PENDING_AUTH_KEY, auth);
}

export function clearPendingAuth(): void {
  removeItem(PENDING_AUTH_KEY);
}
