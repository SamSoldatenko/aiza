'use client';

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useServerConfig } from './ServerConfigContext';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UserSettings {
  theme: ThemeMode;
}

interface SettingsContextValue {
  settings: UserSettings;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
}

const defaultSettings: UserSettings = {
  theme: 'system',
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const lightTheme = createTheme({
  palette: { mode: 'light' },
});

const darkTheme = createTheme({
  palette: { mode: 'dark' },
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { serverId } = useServerConfig();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!serverId) return;

    const stored = localStorage.getItem(`aiza_settings:${serverId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      } catch {
        setSettings(defaultSettings);
      }
    } else {
      setSettings(defaultSettings);
    }
  }, [serverId]);

  const resolvedTheme: 'light' | 'dark' =
  settings.theme === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : settings.theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings(prev => {
      const newSettings = { ...prev, theme };
      if (serverId) {
        localStorage.setItem(`aiza_settings:${serverId}`, JSON.stringify(newSettings));
      }
      return newSettings;
    });
  }, [serverId]);

  const muiTheme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  const contextValue = useMemo(() => ({
    settings,
    theme: settings.theme,
    resolvedTheme,
    setTheme,
  }), [settings, resolvedTheme, setTheme]);

  return (
    <SettingsContext.Provider value={contextValue}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
