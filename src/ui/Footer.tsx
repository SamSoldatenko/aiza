import { useServerConfig } from './context/ServerConfigContext';

function formatTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export default function Footer(): React.ReactElement {
  const { infoJson } = useServerConfig();

  const appBuildTime = formatTimestamp(import.meta.env.VITE_BUILD_TIMESTAMP);
  const backendBuildTime = formatTimestamp(infoJson?.build_timestamp);

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
