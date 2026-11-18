import { useQuery } from '@tanstack/react-query';
import { useActiveWorkspace } from '@/workspace/useActiveWorkspace';
import { PersonalVaultWorkspace } from '@/workspace/personalVault/PersonalVaultWorkspace';

function formatTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export default function Footer(): React.ReactElement {
  const workspace = useActiveWorkspace();
  // Display only: nothing the backend reports configures the app.
  const account = workspace instanceof PersonalVaultWorkspace && workspace.account.configured ? workspace.account : undefined;
  const { data: backendInfo } = useQuery({
    queryKey: ['backend-info', account?.endpoints[0]],
    queryFn: () => account!.info(),
    enabled: Boolean(account),
    staleTime: 10 * 60 * 1000,
  });

  const appBuildTime = formatTimestamp(import.meta.env.VITE_BUILD_TIMESTAMP);
  const backendBuildTime = formatTimestamp(backendInfo?.build_timestamp);

  return (
    <footer className="min-h-16 bg-gray-100 dark:bg-gray-800 p-5 text-center text-sm">
      <div>Aiza app</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {appBuildTime && <span>App built {appBuildTime}</span>}
        {appBuildTime && backendBuildTime && <span> · </span>}
        {backendBuildTime && <span>Backend built {backendBuildTime}</span>}
      </div>
    </footer>
  );
}
