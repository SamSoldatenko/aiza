'use client';

import { GitBranch } from 'lucide-react';

interface AizaViewProps {
  query: string;
}

export default function AizaView({ query }: AizaViewProps): React.ReactElement {
  return (
    <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 p-4 min-h-[400px] flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
      <GitBranch size={64} strokeWidth={1} />
      <p className="mt-4 text-sm">Visualization coming soon</p>
      <p className="mt-1 text-xs text-gray-300 dark:text-gray-600">
        Mind-map nodes with connected results list
      </p>
      {query && <p className="mt-4 text-xs">Query: &quot;{query}&quot;</p>}
    </div>
  );
}
