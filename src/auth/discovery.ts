import { useQuery } from '@tanstack/react-query';
import type { IdentityConfig } from '@/auth/identity';

export interface OpenIdConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
}

const OPENID_STALE_TIME = 10 * 60 * 1000; // 10 minutes

export function discoveryUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

// OpenID discovery is derived from the configured issuer, and the document
// must name that same issuer (OpenID Connect Discovery 1.0, section 4.3).
export async function fetchOpenIdConfig(identity: IdentityConfig): Promise<OpenIdConfig> {
  const url = discoveryUrl(identity.issuer);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load ${url}`);
  }
  const config = (await response.json()) as OpenIdConfig;
  if (config.issuer !== identity.issuer) {
    throw new Error(`Identity provider returned unexpected issuer (expected ${identity.issuer}, got ${config.issuer})`);
  }
  return config;
}

// Nothing is fetched without an identity.
export function useOpenIdConfig(identity: IdentityConfig | undefined) {
  return useQuery({
    queryKey: ['openid-configuration', identity?.issuer],
    queryFn: () => fetchOpenIdConfig(identity!),
    enabled: Boolean(identity),
    staleTime: OPENID_STALE_TIME,
  });
}
