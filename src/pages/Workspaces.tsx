import { Link } from '@tanstack/react-router';
import { LayoutGrid } from 'lucide-react';
import InfoCard from '../ui/InfoCard';
import { presentationOf } from '../ui/workspacePresentation';
import { listWorkspaces, type WorkspaceInfo } from '@/workspace/registry';

function WorkspaceLink({ info }: { info: WorkspaceInfo }): React.ReactElement {
  const { title, color } = presentationOf(info);
  const supported = info.status === 'available';
  return (
    <li>
      <Link
        to="/w/$workspaceId"
        params={{ workspaceId: info.id }}
        className={`flex items-center gap-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md px-2 ${supported ? '' : 'opacity-50'}`}
      >
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-medium text-gray-900 dark:text-white">{title}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {info.id}
          {supported ? '' : ' · not supported by this version'}
        </span>
      </Link>
    </li>
  );
}

export default function Workspaces(): React.ReactElement {
  const all = listWorkspaces();
  const opened = all.filter((info) => info.opened);
  const more = all.filter((info) => !info.opened);

  return (
    <InfoCard icon={<LayoutGrid size={48} className="text-gray-400" />} title="Workspaces">
      {opened.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No workspaces on this device yet. <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">Open the default one</Link>.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {opened.map((info) => <WorkspaceLink key={info.id} info={info} />)}
        </ul>
      )}
      {more.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">More workspaces</h2>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {more.map((info) => <WorkspaceLink key={info.id} info={info} />)}
          </ul>
        </>
      )}
    </InfoCard>
  );
}
