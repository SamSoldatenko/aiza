import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { isAvailableHere, UnknownWorkspaceError } from '@/workspace/registry';
import { workspaceManager } from '@/workspace/WorkspaceManager';
import { UnsupportedWorkspace } from '@/workspace/UnsupportedWorkspace';
import { useWorkspace } from '@/workspace/useActiveWorkspace';
import UnavailableWorkspace from '@/pages/UnavailableWorkspace';

export const Route = createFileRoute('/w/$workspaceId')({
  // Opening a built-in workspace (e.g. by a link from another device) saves
  // its record: it joins this device's workspaces.
  beforeLoad: async ({ params }) => {
    try {
      await workspaceManager.open(params.workspaceId);
    } catch (err) {
      if (err instanceof UnknownWorkspaceError) throw redirect({ to: '/workspaces', replace: true });
      throw err;
    }
  },
  component: WorkspaceLayout,
});

function WorkspaceLayout(): React.ReactElement {
  const workspace = useWorkspace();

  if (workspace instanceof UnsupportedWorkspace) {
    return (
      <UnavailableWorkspace workspace={workspace}>
        {workspace.reason}. The workspace and its data on this device are kept: they can be exported, or the
        workspace opens again in a version of Aiza that supports it.
      </UnavailableWorkspace>
    );
  }

  if (!isAvailableHere(workspace)) {
    return (
      <UnavailableWorkspace workspace={workspace}>
        This workspace can't be used from <code>{location.origin}</code>: its identity provider
        doesn't sign in here.
      </UnavailableWorkspace>
    );
  }

  return <Outlet />;
}
