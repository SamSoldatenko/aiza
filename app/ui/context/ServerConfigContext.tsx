'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getDefaultBackend,
  getBackendType,
  BackendType,
  loadIssuerAllowlist,
  cacheIssuerBinding,
  validateIssuer,
} from '@/app/config/backends';

export type BackendStatus = 'checking' | 'ok' | 'error';
export type { BackendType } from '@/app/config/backends';

export interface ServiceConfig {
  url: string;
  client_id: string;
  scopes: string[];
}

export interface AizaJson {
  name?: string;
  version?: string;
  web?: string;
  'openid-configuration': string;
  client_id?: string;
  api?: ServiceConfig;
  analytics?: ServiceConfig;
}

export interface OpenIdConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint: string;
}

interface ServerConfigContextValue {
  serverId: string | null;
  backendUrl: string | null;
  aizaJson: AizaJson | null;
  openIdConfig: OpenIdConfiguration | null;
  error: string | null;
  status: BackendStatus;
  backendType: BackendType;
  connectTo: (url: string) => void;
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

async function fetchAizaJson(backendUrl: string): Promise<AizaJson> {
  const response = await fetch(backendUrl + '/info.json');
  if (!response.ok) {
    throw new Error(`Cannot load ${backendUrl}/info.json`);
  }
  return response.json();
}

async function fetchOpenIdConfig(url: string): Promise<OpenIdConfiguration> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load ${url}`);
  }
  return response.json();
}

export function ServerConfigProvider({ children }: { children: React.ReactNode }) {
  const [backendUrl, setBackendUrl] = useState<string | null>(null);

  useEffect(() => {
    setBackendUrl(localStorage.getItem('aiza_current_backend') || getDefaultBackend());
  }, []);

  const {
    data: aizaJson,
    isPending: aizaPending,
    error: aizaError,
    refetch: refetchAiza,
  } = useQuery({
    queryKey: ['aiza', backendUrl],
    queryFn: () => fetchAizaJson(backendUrl!),
    enabled: !!backendUrl,
    staleTime: 0,
  });

  const openIdUrl = aizaJson?.['openid-configuration'];
  const {
    data: openIdConfig,
    isPending: openIdPending,
    error: openIdError,
    refetch: refetchOpenId,
  } = useQuery({
    queryKey: ['openid', openIdUrl],
    queryFn: () => fetchOpenIdConfig(openIdUrl!),
    enabled: !!openIdUrl,
    staleTime: OPENID_STALE_TIME,
  });

  const [issuerAllowlist, setIssuerAllowlist] = useState<Record<string, string>>({});

  useEffect(() => {
    setIssuerAllowlist(loadIssuerAllowlist());
  }, []);

  const { validatedOpenIdConfig, issuerError } = useMemo(() => {
    if (!openIdConfig || !backendUrl) return { validatedOpenIdConfig: null, issuerError: null };
    const error = validateIssuer(issuerAllowlist, backendUrl, openIdConfig.issuer);
    if (error) return { validatedOpenIdConfig: null, issuerError: error };
    return { validatedOpenIdConfig: openIdConfig, issuerError: null };
  }, [openIdConfig, backendUrl, issuerAllowlist]);

  useEffect(() => {
    if (!validatedOpenIdConfig || !backendUrl) return;
    if (issuerAllowlist[backendUrl]) return; // already known
    cacheIssuerBinding(backendUrl, validatedOpenIdConfig.issuer);
    setIssuerAllowlist((prev) => ({ ...prev, [backendUrl]: validatedOpenIdConfig.issuer }));
  }, [validatedOpenIdConfig, backendUrl, issuerAllowlist]);

  const serverId = backendUrl ? getServerId(backendUrl) : null;
  const backendType = backendUrl ? getBackendType(backendUrl) : 'prod';
  const error = aizaError?.message ?? openIdError?.message ?? issuerError ?? null;
  const status: BackendStatus = error ? 'error' : aizaPending || openIdPending ? 'checking' : 'ok';

  const connectTo = useCallback((url: string) => {
    localStorage.setItem('aiza_current_backend', url);
    if (url === backendUrl) {
      refetchAiza();
      if (openIdUrl) refetchOpenId();
    }
    setBackendUrl(url);
  }, [backendUrl, openIdUrl, refetchAiza, refetchOpenId]);

  return (
    <ServerConfigContext.Provider
      value={{
        serverId,
        backendUrl,
        aizaJson: aizaJson ?? null,
        openIdConfig: validatedOpenIdConfig,
        error,
        status,
        backendType,
        connectTo,
      }}
    >
      {children}
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
