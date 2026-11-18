import { Link } from '@tanstack/react-router';
import { CircleOff } from 'lucide-react';
import InfoCard from '../ui/InfoCard';
import WorkspaceDataActions from '../ui/WorkspaceDataActions';
import { presentationOf } from '../ui/workspacePresentation';
import { getWorkspaceInfo } from '@/workspace/registry';
import type { Workspace } from '@/workspace/Workspace';

interface UnavailableWorkspaceProps {
  workspace: Workspace;
  // Why the workspace can't be used here.
  children: React.ReactNode;
}

export default function UnavailableWorkspace({ workspace, children }: UnavailableWorkspaceProps): React.ReactElement {
  const info = getWorkspaceInfo(workspace.id);
  const title = info ? presentationOf(info).title : workspace.id;
  return (
    <InfoCard icon={<CircleOff size={48} className="text-gray-400" />} title={title}>
      <p className="text-gray-600 dark:text-gray-400">{children}</p>
      <div className="mt-6">
        <WorkspaceDataActions workspace={workspace} />
      </div>
      <p className="mt-6">
        <Link to="/workspaces" className="text-blue-600 dark:text-blue-400 hover:underline">
          All workspaces
        </Link>
      </p>
    </InfoCard>
  );
}
