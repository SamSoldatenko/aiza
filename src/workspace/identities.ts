import type { IdentityConfig } from '@/auth/identity';

// Identities are defined here, in code: nothing a backend reports at runtime
// configures sign-in. A workspace configuration may only pick one of them by
// name (knownIdentities).
//
// The redirect origins are those whose /cognito_redirect is registered as a
// callback URL in the app client.

// aiza-users Cognito user pool: production users; aiza-be in production
// accepts its tokens.
export const BIN932_OWNER: IdentityConfig = {
  issuer: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_SSH5Zn4xD',
  clientId: '41n5fausr4m817q9uko6rkb5ni',
  idpAdapter: 'cognito',
  scopes: ['openid', 'email'],
  redirectOrigins: ['http://localhost:5173', 'https://aiza.bin932.com'],
};

// aiza-dev Cognito user pool (app client aiza-dev-app): development and test
// users; aiza-be run locally (`quarkus dev`, %dev profile) accepts its tokens.
export const AIZA_DEV_OWNER: IdentityConfig = {
  issuer: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_qs3qDxzG6',
  clientId: '5i4qun7gn2e58g2gun70637plk',
  idpAdapter: 'cognito',
  scopes: ['openid', 'email'],
  redirectOrigins: ['http://localhost:3000', 'http://localhost:5173', 'https://aiza.bin932.com'],
};

// Identities a workspace configuration can name.
export const knownIdentities = {
  bin932: BIN932_OWNER,
  aizaDev: AIZA_DEV_OWNER,
} as const satisfies Record<string, IdentityConfig>;

export type IdentityName = keyof typeof knownIdentities;

export function identityNamed(name: string): IdentityConfig {
  if (!Object.hasOwn(knownIdentities, name)) throw new Error(`No identity "${name}" in this version of Aiza`);
  return knownIdentities[name as IdentityName];
}
