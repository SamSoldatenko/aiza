import { createFileRoute } from '@tanstack/react-router';
import Workspaces from '@/pages/Workspaces';

export const Route = createFileRoute('/workspaces')({
  component: Workspaces,
});
