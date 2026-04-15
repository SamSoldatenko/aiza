'use client';

import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Divider, Menu, MenuItem, TextField, Button } from '@mui/material';
import { User, LogOut, KeyRound, Unplug, EarthLock, UserRoundCheck, Key, PlugZap } from 'lucide-react';
import { DEFAULT_BACKENDS } from '@/app/config/backends';
import { useServerConfig } from './context/ServerConfigContext';
import { useAuth } from './context/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Auth(): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  const { connectTo, backendType, backendUrl } = useServerConfig();
  const { login, logout, apiAccessToken, oauthUserInfo } = useAuth();

  const menuOpen = Boolean(anchorEl);

  function closeMenu(): void {
    setAnchorEl(null);
  }

  function closeDialog(): void {
    setDialogOpen(false);
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>): void {
    setAnchorEl(event.currentTarget);
  }

  function handleLogin(): void {
    login();
    closeMenu();
  }

  function handleLogout(): void {
    logout();
    closeMenu();
  }

  function handleGetAccessKey(): void {
    console.log(apiAccessToken);
    closeMenu();
  }

  function handleSwitchBackend(url: string): void {
    connectTo(url);
    closeMenu();
  }

  function handleOpenCustomDialog(): void {
    setCustomUrl(backendType === 'custom' ? backendUrl ?? '' : '');
    setDialogOpen(true);
    closeMenu();
  }

  function handleConnectCustom(): void {
    if (customUrl.trim()) {
      connectTo(customUrl.trim());
    }
    closeDialog();
  }

  function handleCustomUrlKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.stopPropagation();
      handleConnectCustom();
    }
  }

  const tooltip = oauthUserInfo?.name || oauthUserInfo?.username || 'Not logged in';
  return (
    <div className="relative">
      <button
        onClick={handleClick}
        title={tooltip}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
      >
        {apiAccessToken ? <UserRoundCheck size={20} /> : <User size={20} />}
      </button>
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleLogin} disabled={Boolean(apiAccessToken)}>
          <KeyRound size={18} className="mr-2" /> Login
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <LogOut size={18} className="mr-2" /> Logout
        </MenuItem>
        <Divider />
        <MenuItem disableRipple sx={{ '&:hover': { backgroundColor: 'transparent' } }}>
          <ThemeToggle />
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleGetAccessKey}>
          <Key size={18} className="mr-2" /> Get Access Key
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleSwitchBackend(DEFAULT_BACKENDS.prod)} selected={backendType === 'prod'}>
          <EarthLock size={18} className="mr-2" /> Prod Backend
        </MenuItem>
        <MenuItem onClick={() => handleSwitchBackend(DEFAULT_BACKENDS.dev)} selected={backendType === 'dev'}>
          <Unplug size={18} className="mr-2" /> Dev Backend
        </MenuItem>
        <MenuItem onClick={handleOpenCustomDialog} selected={backendType === 'custom'}>
          <PlugZap size={18} className="mr-2" /> Custom Backend…
        </MenuItem>
      </Menu>
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth disableRestoreFocus>
        <DialogTitle>Connect to Custom Backend</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Backend URL"
            placeholder="http://localhost:8080"
            fullWidth
            variant="outlined"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={handleCustomUrlKeyDown}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button onClick={handleConnectCustom} variant="contained" disabled={!customUrl.trim()}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
