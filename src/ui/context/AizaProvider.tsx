import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreferencesProvider } from './PreferencesContext';

const queryClient = new QueryClient();

export function AizaProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        {children}
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
