import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { getDefaultBackend, getBackendType, BackendType } from '@/config/backends';
import { checkIssuerPin, pinIssuer } from '@/config/issuerPinning';
import { InfoJson, OpenIdConfig, fetchInfoJson, fetchOpenIdConfig } from './backendClient';
import { getCurrentBackendUrl, setCurrentBackendUrl, getServerSettings, setServerSettings } from '@/lib/storage';

export type BackendStatus = 'checking' | 'ok' | 'error';
export type { BackendType } from '@/config/backends';
export type { InfoJson, OpenIdConfig, ServiceConfig } from './backendClient';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UserSettings {
  theme: ThemeMode;
}

const defaultSettings: UserSettings = {
  theme: 'system',
};

interface ServerConfigContextValue {
  backendUrl: string | null;
  setBackendUrl: (url: string) => void;
  infoJson: InfoJson | null;
  openIdConfig: OpenIdConfig | null;
  error: string | null;
  status: BackendStatus;
  backendType: BackendType;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ServerConfigContext = createContext<ServerConfigContextValue | undefined>(undefined);

function getServerId(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const OPENID_STALE_TIME = 10 * 60 * 1000; // 10 minutes

const lightTheme = createTheme({ palette: { mode: 'light' } });
const darkTheme = createTheme({ palette: { mode: 'dark' } });

export function ServerConfigProvider({ children }: { children: React.ReactNode }) {
  const [backendUrl, setBackendUrlState] = useState<string | null>(null);

  useEffect(() => {
    setBackendUrlState(getCurrentBackendUrl() || getDefaultBackend());
  }, []);

  const infoJsonQuery = useQuery({
    queryKey: ['aiza', backendUrl],
    queryFn: () => fetchInfoJson(backendUrl!),
    enabled: !!backendUrl,
    staleTime: 0,
  });

  const openIdUrl = infoJsonQuery.data?.['openid-configuration'];
  const openIdConfigQuery = useQuery({
    queryKey: ['openid', openIdUrl],
    queryFn: () => fetchOpenIdConfig(openIdUrl!),
    enabled: !!openIdUrl,
    staleTime: OPENID_STALE_TIME,
  });

  const { validatedOpenIdConfig, issuerError, isNewIssuerBinding } = useMemo(() => {
    const openIdConfig = openIdConfigQuery.data;
    if (!openIdConfig || !backendUrl) {
      return { validatedOpenIdConfig: null, issuerError: null, isNewIssuerBinding: false };
    }
    const issuer = openIdConfig.issuer;
    const { pinnedBackendUrl: knownBackendUrl, pinnedIssuer: knownIssuer } = checkIssuerPin(backendUrl, issuer);

    if (knownBackendUrl == null && knownIssuer == null) {
      return { validatedOpenIdConfig: openIdConfig, issuerError: null, isNewIssuerBinding: true };
    }
    if (knownIssuer === issuer) {
      return { validatedOpenIdConfig: openIdConfig, issuerError: null, isNewIssuerBinding: false };
    }
    const error = knownIssuer != null
      ? `Backend returned unexpected issuer (expected ${knownIssuer}, got ${issuer})`
      : `Untrusted backend claims issuer that belongs to ${knownBackendUrl}`;
    return { validatedOpenIdConfig: null, issuerError: error, isNewIssuerBinding: false };
  }, [openIdConfigQuery.data, backendUrl]);

  useEffect(() => {
    if (!isNewIssuerBinding || !validatedOpenIdConfig || !backendUrl) return;
    pinIssuer(backendUrl, validatedOpenIdConfig.issuer);
  }, [isNewIssuerBinding, validatedOpenIdConfig, backendUrl]);

  const serverId = backendUrl ? getServerId(backendUrl) : null;
  const backendType = backendUrl ? getBackendType(backendUrl) : 'prod';
  const error = infoJsonQuery.error?.message ?? openIdConfigQuery.error?.message ?? issuerError ?? null;
  const status: BackendStatus =
    error ? 'error' : infoJsonQuery.isPending || openIdConfigQuery.isPending ? 'checking' : 'ok';

  const { refetch: refetchInfoJson } = infoJsonQuery;
  const { refetch: refetchOpenIdConfig } = openIdConfigQuery;

  const setBackendUrl = useCallback((url: string) => {
    setCurrentBackendUrl(url);
    if (url === backendUrl) {
      refetchInfoJson();
      if (openIdUrl) refetchOpenIdConfig();
    }
    setBackendUrlState(url);
  }, [backendUrl, openIdUrl, refetchInfoJson, refetchOpenIdConfig]);

  // --- Settings (theme), persisted per-server ---

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
    setSettings({ ...defaultSettings, ...getServerSettings(serverId, {}) });
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
        setServerSettings(serverId, newSettings);
      }
      return newSettings;
    });
  }, [serverId]);

  const muiTheme = resolvedTheme === 'dark' ? darkTheme : lightTheme;
  const infoJson = infoJsonQuery.data ?? null;

  const contextValue = useMemo(() => ({
    backendUrl,
    setBackendUrl,
    infoJson,
    openIdConfig: validatedOpenIdConfig,
    error,
    status,
    backendType,
    theme: settings.theme,
    setTheme,
  }), [backendUrl, setBackendUrl, infoJson, validatedOpenIdConfig, error, status, backendType, settings.theme, setTheme]);

  return (
    <ServerConfigContext.Provider value={contextValue}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ServerConfigContext.Provider>
  );
}

export function useServerConfig() {
  const context = useContext(ServerConfigContext);
  if (!context) {
    throw new Error('useServerConfig must be used within a ServerConfigProvider');
  }
  return context;
}
