import { getCachedIssuers, setCachedIssuers } from '@/lib/storage';
import { DEFAULT_BACKENDS } from './backends';

// Hardcoded backend URL → expected JWT issuer mapping.
// Updated with releases; takes precedence over cached values.
const BACKEND_ISSUERS: Record<string, string> = {
  [DEFAULT_BACKENDS.prod]: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_SSH5Zn4xD',
  [DEFAULT_BACKENDS.dev]: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_qs3qDxzG6',
};

// Hardcoded entries always win, regardless of what's cached, so a release
// that updates BACKEND_ISSUERS is never shadowed by a stale cached value.
export function getPinnedIssuers(): Record<string, string> {
  return { ...getCachedIssuers(), ...BACKEND_ISSUERS };
}

export function pinIssuer(backendUrl: string, issuer: string): void {
  const cached = getCachedIssuers();
  cached[backendUrl] = issuer;
  // Drop any entries that now duplicate a hardcoded default, e.g. a backend
  // that used to be custom and became a default in a later release.
  for (const key of Object.keys(BACKEND_ISSUERS)) {
    delete cached[key];
  }
  setCachedIssuers(cached);
}

// Cross-references both directions of a backendUrl <-> issuer pin:
// - `pinnedBackendUrl`: which backend (if any) already owns `issuer`
// - `pinnedIssuer`: which issuer (if any) is already pinned for `backendUrl`
export function checkIssuerPin(
  backendUrl: string,
  issuer: string,
): { pinnedBackendUrl: string | null; pinnedIssuer: string | null } {
  const pinned = getPinnedIssuers();
  const ownerEntry = Object.entries(pinned).find(([, iss]) => iss === issuer);
  return {
    pinnedBackendUrl: ownerEntry ? ownerEntry[0] : null,
    pinnedIssuer: pinned[backendUrl] ?? null,
  };
}
