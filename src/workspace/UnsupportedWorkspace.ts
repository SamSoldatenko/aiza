import { Workspace } from './Workspace';
import type { WorkspaceRecord } from './registry';

// Stands in for a stored workspace this build can't create: its class was
// removed or renamed, the release was rolled back, or its record is
// unreadable. The record and data stay on the device; only the common
// capabilities (export, import, deletion) are offered.
export class UnsupportedWorkspace extends Workspace {
  readonly identities = {};
  readonly services = {};

  constructor(
    id: string,
    readonly record: Readonly<WorkspaceRecord>,
    readonly reason: string,
  ) {
    super(id);
  }

  get config(): object {
    return this.record.config;
  }
}
