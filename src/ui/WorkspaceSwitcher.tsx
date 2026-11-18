import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Divider, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import { AlertTriangle, Check, CheckCircle, ChevronDown, Settings, WifiOff, XCircle } from 'lucide-react';
import { useOpenIdConfig } from '@/auth/discovery';
import { getWorkspaceInfo, listWorkspaces } from '@/workspace/registry';
import { useActiveWorkspace } from '@/workspace/useActiveWorkspace';
import { primaryIdentity } from '@/workspace/signIn';
import { UnsupportedWorkspace } from '@/workspace/UnsupportedWorkspace';
import type { Workspace } from '@/workspace/Workspace';
import { useOnline } from '@/lib/useOnline';
import { presentationOf } from './workspacePresentation';

interface Status {
  color: string;
  icon: React.ReactNode;
  label: string;
}

// What is known about the active workspace without asking its services:
// whether the browser is online and its identity provider can be discovered.
// The workspace settings page checks every service.
function useWorkspaceStatus(workspace: Workspace | null): Status {
  const online = useOnline();
  const identity = workspace ? primaryIdentity(workspace) : undefined;
  const discovery = useOpenIdConfig(online ? identity : undefined);

  if (!online) return { color: 'text-red-500', icon: <WifiOff size={14} />, label: 'This device is offline' };
  if (workspace instanceof UnsupportedWorkspace) {
    return { color: 'text-amber-500', icon: <AlertTriangle size={14} />, label: 'Not supported by this version' };
  }
  if (discovery.error) return { color: 'text-red-500', icon: <XCircle size={14} />, label: discovery.error.message };
  return { color: 'text-green-500', icon: <CheckCircle size={14} />, label: 'Online' };
}

// Always shows which workspace is active (name + color) and its status;
// its menu leads to the workspace settings and lists the workspaces opened on
// this device (the active one highlighted) to switch between them.
export default function WorkspaceSwitcher(): React.ReactElement | null {
  const active = useActiveWorkspace();
  const status = useWorkspaceStatus(active);
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const info = active ? getWorkspaceInfo(active.id) : undefined;
  if (!active || !info) return null;
  const current = presentationOf(info);

  // Workspaces opened on this device, the active one included.
  const workspaces = anchorEl ? listWorkspaces().filter((w) => w.opened) : [];

  function close(): void {
    setAnchorEl(null);
  }

  function go(to: '/w/$workspaceId' | '/w/$workspaceId/settings', id: string): void {
    close();
    navigate({ to, params: { workspaceId: id } });
  }

  return (
    <>
      <Tooltip title={status.label}>
        <button
          onClick={(e) => setAnchorEl(e.currentTarget)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-gray-900 dark:text-white border-l-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
          style={{ borderLeftColor: current.color }}
          aria-label={`Workspace: ${current.title}`}
        >
          <span className="max-w-40 truncate">{current.title}</span>
          <span className={status.color} aria-label={`Workspace status: ${status.label}`}>{status.icon}</span>
          <ChevronDown size={16} />
        </button>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <MenuItem onClick={() => go('/w/$workspaceId/settings', active.id)}>
          <ListItemIcon><Settings size={18} /></ListItemIcon>
          <ListItemText primary="Settings" secondary={status.label} />
        </MenuItem>
        <Divider />
        {workspaces.map((w) => {
          const { title, color } = presentationOf(w);
          return (
            <MenuItem key={w.id} selected={w.id === active.id} onClick={() => go('/w/$workspaceId', w.id)}>
              <ListItemIcon>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              </ListItemIcon>
              <ListItemText primary={title} />
              {w.id === active.id && <Check size={16} className="ml-3" />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
