import type { QueryKey } from '@tanstack/react-query';
import type { IdentityConfig } from '@/auth/identity';
import { workspaceStorage, type WorkspaceStorage } from '@/lib/storage';
import type { ServiceClient } from './services/ServiceClient';

// What a workspace exports and imports: the user's data kept on this device.
// Never tokens: sessions belong to identities, not to workspaces.
export interface WorkspaceData {
  storage: Record<string, unknown>;
}

// A runtime workspace: owns its configuration, state and services. Built by
// createWorkspace() (registry.ts) and activated by the WorkspaceManager.
// Knows nothing about how it is presented (title, color, icon): that's the UI's.
export abstract class Workspace {
  readonly storage: WorkspaceStorage;

  constructor(readonly id: string) {
    this.storage = workspaceStorage(id);
  }

  // The configuration the workspace works with, in the current format. A
  // class keeps the object it was given unless it had to migrate it from an
  // older format: a different object is saved to the workspace's record.
  abstract readonly config: object;

  // Identities the workspace signs in with, by role.
  abstract readonly identities: Readonly<Record<string, IdentityConfig>>;

  // Clients of its services by name, for pages that show every service of a workspace.
  abstract readonly services: Readonly<Record<string, ServiceClient>>;

  async init(): Promise<void> {}

  dispose(): void {}

  // Every query that touches workspace data is keyed under the workspace, so
  // data of two workspaces never shares a cache entry.
  queryKey(...rest: unknown[]): QueryKey {
    return ['ws', this.id, ...rest];
  }

  exportData(): WorkspaceData {
    return { storage: this.storage.entries() };
  }

  importData(data: WorkspaceData): void {
    this.storage.replace(data.storage);
  }
}
