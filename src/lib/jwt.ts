// JWT payload decoding without signature verification: the browser only needs
// to read claims (issuer, expiry, client id) of tokens it already received over
// TLS from the IdP. Never throws — an unreadable token yields `null`.

// Accepts base64url (as JWTs use) and, leniently, standard base64 with padding.
function base64UrlToBytes(input: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/_-]*=*$/.test(input)) return null;
  const base64 = input.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const bytes = base64UrlToBytes(parts[1]);
  if (!bytes) return null;

  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const payload: unknown = JSON.parse(json);
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AccessTokenClaims {
  iss: string;
  exp: number;
  client_id: string;
  sub?: string;
}

// Claims the app relies on for an access token. `client_id` is how Cognito
// names the app client in access tokens.
export function readAccessTokenClaims(token: string): AccessTokenClaims | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const { iss, exp, client_id, sub } = payload;
  if (typeof iss !== 'string' || typeof exp !== 'number' || typeof client_id !== 'string') return null;
  return { iss, exp, client_id, ...(typeof sub === 'string' ? { sub } : {}) };
}
