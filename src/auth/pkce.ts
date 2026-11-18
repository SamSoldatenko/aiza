const RANDOM_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < length; i++) {
    result += RANDOM_CHARSET[bytes[i] % RANDOM_CHARSET.length];
  }
  return result;
}

// RFC 7636: code verifier of 43..128 unreserved characters.
export function generateCodeVerifier(): string {
  return randomString(64);
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const binary = String.fromCharCode(...new Uint8Array(digest));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
