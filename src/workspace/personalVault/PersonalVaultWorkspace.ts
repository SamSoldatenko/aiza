import { Workspace } from '../Workspace';
import type { IdentityConfig } from '@/auth/identity';
import { identityNamed, type IdentityName } from '../identities';
import { AccountClient, DataVaultClient, SyncthingClient, VaultClient } from './clients';

// The config is typed by the constructor parameter; this alias only names it.
export type PersonalVaultConfig = NonNullable<ConstructorParameters<typeof PersonalVaultWorkspace>[1]>;

// Personal vault of the bin932 owner: an encrypted volume on a server, an
// assistant over its data and Syncthing. The config says where the services
// are and which of the identities defined in code signs in to them. A
// service without an address is not configured (and its scopes aren't
// requested at sign-in). Each client knows the scopes it needs.
export class PersonalVaultWorkspace extends Workspace {
  readonly identities: { owner: IdentityConfig };

  readonly account: AccountClient;
  readonly vault: VaultClient;
  readonly dataVault: DataVaultClient;
  readonly serverSync: SyncthingClient;
  readonly services: { account: AccountClient; vault: VaultClient; dataVault: DataVaultClient; serverSync: SyncthingClient };

  constructor(
    id: string,
    readonly config: {
      // aiza-be: account API (/accounts/me) and display-only /info.json.
      api?: string;
      vault?: string[];
      dataVault?: string[];
      serverSync?: string;
      // Identity signing in to every service (default: bin932).
      identity?: IdentityName;
    } = {},
  ) {
    super(id);
    const owner = identityNamed(config.identity ?? 'bin932');
    this.identities = { owner };
    this.account = new AccountClient(config.api ? [config.api] : undefined, owner);
    this.vault = new VaultClient(config.vault, owner);
    this.dataVault = new DataVaultClient(config.dataVault, owner);
    this.serverSync = new SyncthingClient(config.serverSync ? [config.serverSync] : undefined, owner);
    this.services = { account: this.account, vault: this.vault, dataVault: this.dataVault, serverSync: this.serverSync };
  }
}
