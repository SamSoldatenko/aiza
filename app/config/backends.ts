export const DEFAULT_BACKENDS = {
  prod: 'https://aiza-be.bin932.com:3150',
  dev: 'http://localhost:8080',
} as const;

export function getDefaultBackend(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_BACKENDS.prod;
  }
  const host = window.location.host;
  if (host === 'localhost:3000') {
    return DEFAULT_BACKENDS.dev;
  }
  return DEFAULT_BACKENDS.prod;
}

export type BackendKey = keyof typeof DEFAULT_BACKENDS;

export type BackendType = 'dev' | 'prod' | 'custom';

export function getBackendType(url: string): BackendType {
  if (url === DEFAULT_BACKENDS.dev) return 'dev';
  if (url === DEFAULT_BACKENDS.prod) return 'prod';
  return 'custom';
}

// Hardcoded backend URL → expected JWT issuer mapping.
// Updated with releases; takes precedence over cached values.
const BACKEND_ISSUERS: Record<string, string> = {
  [DEFAULT_BACKENDS.prod]: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_SSH5Zn4xD',
  [DEFAULT_BACKENDS.dev]: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_qs3qDxzG6',
};

const CACHED_ISSUERS_KEY = 'aiza_backend_issuers';

function getCachedIssuers(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return JSON.parse(localStorage.getItem(CACHED_ISSUERS_KEY) || '{}');
}

export function loadIssuerAllowlist(): Record<string, string> {
  const cached = getCachedIssuers();
  let changed = false;
  for (const key of Object.keys(BACKEND_ISSUERS)) {
    if (key in cached) {
      delete cached[key];
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem(CACHED_ISSUERS_KEY, JSON.stringify(cached));
  }
  return { ...BACKEND_ISSUERS, ...cached };
}

export function cacheIssuerBinding(backendUrl: string, issuer: string): void {
  const cached = getCachedIssuers();
  cached[backendUrl] = issuer;
  localStorage.setItem(CACHED_ISSUERS_KEY, JSON.stringify(cached));
}

// Returns null if valid, or an error message string if rejected.
export function validateIssuer(
  allowlist: Record<string, string>,
  backendUrl: string,
  issuer: string,
): string | null {
  const expectedIssuer = allowlist[backendUrl];
  if (expectedIssuer) {
    return issuer === expectedIssuer
      ? null
      : `Backend returned unexpected issuer (expected ${expectedIssuer}, got ${issuer})`;
  }
  const ownerEntry = Object.entries(allowlist).find(([, iss]) => iss === issuer);
  if (ownerEntry) {
    return `Untrusted backend claims issuer that belongs to ${ownerEntry[0]}`;
  }
  return null;
}
