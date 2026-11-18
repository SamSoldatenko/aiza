// Clients of the personal vault's services. Only the account API (aiza-be)
// exists today; the paths of the others are the contract the frontend expects.
// Each client declares the scopes its token carries: the IdP issues it a
// grant of its own (resource servers `bin932.*` of the user pool).

import { ServiceClient, ServiceRequestError } from '../services/ServiceClient';

export interface AccountInfo {
  id: string;
  created: string;
  modified: string;
  oauthId: {
    issuer: string;
    subject: string;
  };
}

// What aiza-be reports about itself; display only, nothing here configures the app.
export interface BackendInfo {
  name?: string;
  version?: string;
  build_timestamp?: string;
}

export class AccountClient extends ServiceClient {
  // aiza-be accepts the sign-in token (the identity's own scopes).
  readonly scopes: readonly string[] = [];

  me(): Promise<AccountInfo> {
    return this.fetchJson<AccountInfo>('/accounts/me');
  }

  // Public, unauthenticated.
  info(): Promise<BackendInfo> {
    return this.fetchPublicJson<BackendInfo>('/info.json');
  }

  async probe(): Promise<string | undefined> {
    const me = await this.me();
    return me?.id ? `Account ${me.id}` : undefined;
  }
}

export const VAULT_STATES = ['locked', 'unlocking', 'unlocked', 'error'] as const;
export type VaultState = (typeof VAULT_STATES)[number];

export class VaultClient extends ServiceClient {
  readonly scopes = ['bin932.vault/status.read', 'bin932.vault/unlock', 'bin932.vault/lock'];

  async status(): Promise<VaultState> {
    const status = await this.fetchJson<{ state?: unknown }>('/status');
    const state = VAULT_STATES.find((s) => s === status.state);
    if (!state) throw new ServiceRequestError('error', 'Unknown volume state');
    return state;
  }

  unlock(): Promise<void> {
    return this.expectOk('/unlock', { method: 'POST' });
  }

  lock(): Promise<void> {
    return this.expectOk('/lock', { method: 'POST' });
  }

  async probe(): Promise<string | undefined> {
    return `Volume ${await this.status()}`;
  }
}

// Assistant and file index over the vault's data. Answers only while the
// volume is unlocked.
export class DataVaultClient extends ServiceClient {
  readonly scopes = ['bin932.assistant/search', 'bin932.assistant/chat', 'bin932.assistant/files.read'];

  async probe(): Promise<string | undefined> {
    await this.expectOk('/health');
    return undefined;
  }
}

export class SyncthingClient extends ServiceClient {
  readonly scopes = ['bin932.syncthing/read', 'bin932.syncthing/manage'];

  async probe(): Promise<string | undefined> {
    await this.expectOk('/rest/system/ping');
    return undefined;
  }
}
