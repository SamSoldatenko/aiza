export const DEFAULT_BACKENDS = {
  prod: 'https://aiza-be.bin932.com:3150',
  dev: 'http://localhost:8080',
} as const;

export function getDefaultBackend(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_BACKENDS.prod;
  }
  const host = window.location.host;
  if (host === 'localhost:5173') {
    return DEFAULT_BACKENDS.dev;
  }
  return DEFAULT_BACKENDS.prod;
}

export type BackendType = 'dev' | 'prod' | 'custom';

export function getBackendType(url: string): BackendType {
  if (url === DEFAULT_BACKENDS.dev) return 'dev';
  if (url === DEFAULT_BACKENDS.prod) return 'prod';
  return 'custom';
}
