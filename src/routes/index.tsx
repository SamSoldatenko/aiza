import { createFileRoute, redirect } from '@tanstack/react-router';
import { defaultWorkspaceId } from '@/workspace/registry';

// `/` has no page of its own: it opens the last opened workspace (a built-in
// one on first launch).
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const workspaceId = defaultWorkspaceId();
    if (!workspaceId) throw redirect({ to: '/workspaces', replace: true });
    throw redirect({ to: '/w/$workspaceId', params: { workspaceId }, replace: true });
  },
});
