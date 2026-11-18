import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Divider, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { Check, ChevronDown, LayoutGrid, Settings } from 'lucide-react';
import { getWorkspaceInfo, listWorkspaces } from '@/workspace/registry';
import { useActiveWorkspace } from '@/workspace/useActiveWorkspace';
import { presentationOf } from './workspacePresentation';

// Always shows which workspace is active (name + color); switching is an
// explicit action.
export default function WorkspaceSwitcher(): React.ReactElement | null {
  const active = useActiveWorkspace();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const info = active ? getWorkspaceInfo(active.id) : undefined;
  if (!active || !info) return null;
  const current = presentationOf(info);

  const workspaces = anchorEl ? listWorkspaces().filter((w) => w.opened) : [];

  function close(): void {
    setAnchorEl(null);
  }

  function go(to: '/w/$workspaceId' | '/w/$workspaceId/settings' | '/workspaces', id?: string): void {
    close();
    navigate(id ? { to, params: { workspaceId: id } } : { to });
  }

  return (
    <>
      <button
        onClick={(e) => setAnchorEl(e.currentTarget)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-gray-900 dark:text-white border-l-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        style={{ borderLeftColor: current.color }}
        aria-label={`Workspace: ${current.title}`}
      >
        <span className="max-w-40 truncate">{current.title}</span>
        <ChevronDown size={16} />
      </button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
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
        <Divider />
        <MenuItem onClick={() => go('/w/$workspaceId/settings', active.id)}>
          <ListItemIcon><Settings size={18} /></ListItemIcon>
          <ListItemText primary="Workspace settings" />
        </MenuItem>
        <MenuItem onClick={() => go('/workspaces')}>
          <ListItemIcon><LayoutGrid size={18} /></ListItemIcon>
          <ListItemText primary="All workspaces" />
        </MenuItem>
      </Menu>
    </>
  );
}
