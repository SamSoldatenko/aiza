import { Link } from '@tanstack/react-router';
import { Tooltip } from '@mui/material';
import { AlertTriangle, CheckCircle, Server, WifiOff, XCircle } from 'lucide-react';
import { useOpenIdConfig } from '@/auth/discovery';
import { useActiveWorkspace } from '@/workspace/useActiveWorkspace';
import { primaryIdentity } from '@/workspace/signIn';
import { UnsupportedWorkspace } from '@/workspace/UnsupportedWorkspace';
import { useOnline } from '@/lib/useOnline';

// Id of the active workspace and what is known without asking its services:
// whether the browser is online and the identity provider can be discovered.
// Links to the workspace page that checks every service.
export default function WorkspaceStatusIndicator(): React.ReactElement | null {
  const workspace = useActiveWorkspace();
  const online = useOnline();
  const identity = workspace ? primaryIdentity(workspace) : undefined;
  const discovery = useOpenIdConfig(online ? identity : undefined);

  if (!workspace) return null;

  const { color, icon, label } = !online
    ? { color: 'text-red-500', icon: <WifiOff size={14} />, label: 'This device is offline' }
    : workspace instanceof UnsupportedWorkspace
      ? { color: 'text-amber-500', icon: <AlertTriangle size={14} />, label: 'Not supported by this version' }
      : discovery.error
        ? { color: 'text-red-500', icon: <XCircle size={14} />, label: discovery.error.message }
        : { color: 'text-green-500', icon: <CheckCircle size={14} />, label: 'Online' };

  return (
    <Tooltip title={label}>
      <Link
        to="/w/$workspaceId/settings"
        params={{ workspaceId: workspace.id }}
        className={`flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium ${color}`}
        aria-label={`Workspace status: ${label}`}
      >
        <Server size={14} />
        <span>{workspace.id}</span>
        {icon}
      </Link>
    </Tooltip>
  );
}
