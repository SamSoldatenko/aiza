import { createFileRoute } from '@tanstack/react-router';
import WorkspaceSettings from '@/pages/WorkspaceSettings';

export const Route = createFileRoute('/w/$workspaceId/settings')({
  component: WorkspaceSettings,
});
