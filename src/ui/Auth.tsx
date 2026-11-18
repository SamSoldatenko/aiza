import { useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Divider, ListItemText, Menu, MenuItem } from '@mui/material';
import { User, LogOut, KeyRound, UserRoundCheck, Key, DoorOpen } from 'lucide-react';
import { tokenBroker } from '@/auth/tokenBroker';
import { displayName, useIdentity } from '@/auth/useIdentity';
import { useActiveWorkspace } from '@/workspace/useActiveWorkspace';
import { getWorkspaceInfo, isAvailableHere, workspacesOnDevice } from '@/workspace/registry';
import { authorizationRequests, identitiesOnlyUsedBy, otherWorkspacesUsing, primaryIdentity } from '@/workspace/signIn';
import ThemeToggle from './ThemeToggle';
import { presentationOf } from './workspacePresentation';

function titleOf(id: string): string {
  const info = getWorkspaceInfo(id);
  return info ? presentationOf(info).title : id;
}

export default function Auth(): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const href = useRouterState({ select: (s) => s.location.href });

  const workspace = useActiveWorkspace();
  const identity = workspace ? primaryIdentity(workspace) : undefined;
  const { state, claims } = useIdentity(identity);
  const signedIn = state === 'signed-in';
  const canSignIn = Boolean(workspace && identity && isAvailableHere(workspace));

  const allWorkspaces = anchorEl ? workspacesOnDevice() : [];
  const sharedWith = workspace && identity ? otherWorkspacesUsing(identity, workspace, allWorkspaces) : [];

  function closeMenu(): void {
    setAnchorEl(null);
  }

  function handleLogin(): void {
    closeMenu();
    if (!workspace || !identity) return;
    tokenBroker
      .login(identity, { requests: authorizationRequests(workspace, identity), workspaceId: workspace.id, returnTo: href })
      .catch((err) => console.error('Sign-in failed:', err));
  }

  function handleSignOutWorkspace(): void {
    closeMenu();
    if (!workspace) return;
    for (const i of identitiesOnlyUsedBy(workspace, workspacesOnDevice())) {
      tokenBroker.forget(i).catch((err) => console.error('Sign-out failed:', err));
    }
  }

  function handleSignOutAccount(): void {
    closeMenu();
    if (identity) tokenBroker.endSession(identity).catch((err) => console.error('Sign-out failed:', err));
  }

  async function handleGetAccessKey(): Promise<void> {
    closeMenu();
    if (!identity) return;
    try {
      console.log(await tokenBroker.getToken(identity, []));
    } catch (err) {
      console.error('Failed to get access key:', err);
    }
  }

  const name = displayName(claims);
  const tooltip = name ?? 'Not logged in';
  return (
    <div className="relative">
      <button
        onClick={(e) => setAnchorEl(e.currentTarget)}
        title={tooltip}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
      >
        {signedIn ? <UserRoundCheck size={20} /> : <User size={20} />}
      </button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {name && (
          <MenuItem disabled>
            <ListItemText primary={name} />
          </MenuItem>
        )}
        <MenuItem onClick={handleLogin} disabled={!canSignIn || signedIn}>
          <KeyRound size={18} className="mr-2" /> Login
        </MenuItem>
        <MenuItem onClick={handleSignOutWorkspace} disabled={!signedIn}>
          <DoorOpen size={18} className="mr-2" /> Sign out of this workspace
        </MenuItem>
        <MenuItem onClick={handleSignOutAccount} disabled={!signedIn}>
          <LogOut size={18} className="mr-2" />
          <ListItemText
            primary="Logout"
            secondary={sharedWith.length > 0 ? `Also signs out ${sharedWith.map((w) => titleOf(w.id)).join(', ')}` : undefined}
          />
        </MenuItem>
        <Divider />
        <MenuItem disableRipple sx={{ '&:hover': { backgroundColor: 'transparent' } }}>
          <ThemeToggle />
        </MenuItem>
        {import.meta.env.DEV && <Divider />}
        {import.meta.env.DEV && (
          <MenuItem onClick={handleGetAccessKey} disabled={!signedIn}>
            <Key size={18} className="mr-2" /> Get Access Key
          </MenuItem>
        )}
      </Menu>
    </div>
  );
}
