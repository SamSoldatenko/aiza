import { useSyncExternalStore } from 'react';
import { workspaceManager } from './WorkspaceManager';
import type { Workspace } from './Workspace';

// The active workspace of this tab: the one opened by the last visited
// /w/$workspaceId route. Stays active on pages outside any workspace.
export function useActiveWorkspace(): Workspace | null {
  return useSyncExternalStore(workspaceManager.subscribe, () => workspaceManager.active);
}

// For pages under /w/$workspaceId, whose route opens the workspace first.
export function useWorkspace(): Workspace {
  const workspace = useActiveWorkspace();
  if (!workspace) throw new Error('useWorkspace must be used inside a workspace route (/w/$workspaceId)');
  return workspace;
}
