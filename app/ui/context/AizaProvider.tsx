'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServerConfigProvider } from './ServerConfigContext';
import { AuthProvider } from './AuthContext';
import { SettingsProvider } from './SettingsContext';

const queryClient = new QueryClient();

export function AizaProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ServerConfigProvider>
        <AuthProvider>
          <SettingsProvider>
            {children}
          </SettingsProvider>
        </AuthProvider>
      </ServerConfigProvider>
    </QueryClientProvider>
  );
}
