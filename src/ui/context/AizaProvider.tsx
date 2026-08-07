import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServerConfigProvider } from './ServerConfigContext';
import { AuthProvider } from './AuthContext';

const queryClient = new QueryClient();

export function AizaProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ServerConfigProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ServerConfigProvider>
    </QueryClientProvider>
  );
}
