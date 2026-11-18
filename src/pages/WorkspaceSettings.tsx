import { useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@mui/material';
import { Settings, WifiOff } from 'lucide-react';
import InfoCard from '../ui/InfoCard';
import StatusBadge, { type StatusTone } from '../ui/StatusBadge';
import WorkspaceDataActions from '../ui/WorkspaceDataActions';
import { presentationOf, roleLabel, serviceLabel } from '../ui/workspacePresentation';
import { useWorkspace } from '@/workspace/useActiveWorkspace';
import { getWorkspaceInfo } from '@/workspace/registry';
import { authorizationRequests } from '@/workspace/signIn';
import type { AuthorizationRequest } from '@/auth/tokenBroker';
import { ServiceRequestError, type ServiceClient } from '@/workspace/services/ServiceClient';
import type { Workspace } from '@/workspace/Workspace';
import type { IdentityConfig } from '@/auth/identity';
import { tokenBroker } from '@/auth/tokenBroker';
import { displayName, useBrokerVersion, useIdentity } from '@/auth/useIdentity';
import { useOnline } from '@/lib/useOnline';

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{title}</h2>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  detail?: React.ReactNode;
  reason?: React.ReactNode;
  status?: React.ReactNode;
  action?: React.ReactNode;
}

function Row({ label, detail, reason, status, action }: RowProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
      <span className="font-medium text-gray-900 dark:text-white w-56 shrink-0">{label}</span>
      <span className="flex-1 min-w-40 text-sm text-gray-600 dark:text-gray-400 break-all">
        {detail}
        {reason && <span className="block text-xs text-gray-500 dark:text-gray-500">{reason}</span>}
      </span>
      {status}
      {action}
    </div>
  );
}

// Signs in (if needed) and obtains the grants of `requests`; by default those
// of every configured service of the workspace using `identity`.
function useSignIn(workspace: Workspace): (identity: IdentityConfig, requests?: AuthorizationRequest[]) => void {
  const href = useRouterState({ select: (s) => s.location.href });
  return (identity, requests = authorizationRequests(workspace, identity)) => {
    tokenBroker
      .login(identity, { requests, workspaceId: workspace.id, returnTo: href })
      .catch((err) => console.error('Sign-in failed:', err));
  };
}

function IdentityRow({ role, identity, signIn }: { role: string; identity: IdentityConfig; signIn: () => void }): React.ReactElement {
  const view = useIdentity(identity);
  return (
    <Row
      label={roleLabel(role)}
      detail={displayName(view.claims) ?? identity.issuer}
      reason={view.claims ? identity.issuer : undefined}
      status={view.state === 'signed-out'
        ? <StatusBadge tone="attention">Not signed in</StatusBadge>
        : <StatusBadge tone="ok">Signed in</StatusBadge>}
      action={view.state === 'signed-out' && <Button size="small" variant="outlined" onClick={signIn}>Sign in</Button>}
    />
  );
}

const FAILURES: Record<ServiceRequestError['kind'], { tone: StatusTone; label: string }> = {
  unconfigured: { tone: 'muted', label: 'Not configured' },
  network: { tone: 'error', label: 'Unreachable' },
  unauthorized: { tone: 'error', label: 'Rejected' },
  forbidden: { tone: 'error', label: 'Access denied' },
  'needs-login': { tone: 'attention', label: 'Sign-in required' },
  'needs-consent': { tone: 'attention', label: 'Authorization required' },
  error: { tone: 'error', label: 'Error' },
};

function failureOf(error: unknown): { tone: StatusTone; label: string } {
  if (error instanceof ServiceRequestError) return FAILURES[error.kind];
  return FAILURES.error;
}

interface ServiceRowProps {
  workspace: Workspace;
  name: string;
  service: ServiceClient;
  online: boolean;
  signIn: (identity: IdentityConfig, requests?: AuthorizationRequest[]) => void;
}

// What is known without asking the service (address, sign-in, granted
// scopes, browser offline) is shown as is; otherwise the service's own probe
// tells whether it works.
function ServiceRow({ workspace, name, service, online, signIn }: ServiceRowProps): React.ReactElement {
  const { identity, scopes } = service;
  const view = useIdentity(identity);
  useBrokerVersion();
  const known: { tone: StatusTone; label: string; action?: 'sign-in' | 'authorize' } | null =
    !service.configured ? { tone: 'muted', label: 'Not configured' }
    : view.state === 'signed-out' ? { tone: 'attention', label: 'Sign-in required', action: 'sign-in' }
    : !tokenBroker.canIssue(identity, scopes) ? { tone: 'attention', label: 'Authorization required', action: 'authorize' }
    : !online ? { tone: 'muted', label: 'Offline' }
    : !service.probe ? { tone: 'muted', label: 'Not checked' }
    : null;

  const probe = useQuery({
    queryKey: workspace.queryKey(name, 'probe', view.claims?.sub ?? null),
    queryFn: () => service.probe!(),
    enabled: known === null,
    retry: false,
  });

  // An authorization (a grant of this service's own) is obtained for its
  // scopes only; the IdP may ask the user to confirm it.
  const authorize = () => signIn(identity, [{ scopes: [...scopes], services: [name] }]);
  function actionOf(action: 'sign-in' | 'authorize' | undefined, error: unknown): React.ReactNode {
    const kind = error instanceof ServiceRequestError ? error.kind : undefined;
    if (action === 'sign-in' || kind === 'needs-login') {
      return <Button size="small" variant="outlined" onClick={() => signIn(identity)}>Sign in</Button>;
    }
    if (action === 'authorize' || kind === 'needs-consent') {
      return <Button size="small" variant="outlined" onClick={authorize}>Authorize</Button>;
    }
    return null;
  }

  const status = known
    ?? (probe.isSuccess ? { tone: 'ok' as const, label: 'Connected' }
      : probe.isError ? failureOf(probe.error)
      : { tone: 'progress' as const, label: 'Checking' });
  const { endpoint, endpoints } = service;

  return (
    <Row
      label={serviceLabel(name)}
      detail={endpoint && endpoint + (endpoints.length > 1 ? ` (+${endpoints.length - 1} fallback)` : '')}
      reason={known ? undefined : probe.isError ? (probe.error as Error).message : probe.data}
      status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      action={actionOf(known?.action, probe.error)}
    />
  );
}

// What the workspace consists of: its identities and services with their
// state, and what it keeps on this device.
export default function WorkspaceSettings(): React.ReactElement {
  const workspace = useWorkspace();
  const info = getWorkspaceInfo(workspace.id);
  const online = useOnline();
  const signIn = useSignIn(workspace);

  return (
    <InfoCard icon={<Settings size={48} className="text-gray-400" />} title={info ? presentationOf(info).title : workspace.id}>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        <code>{workspace.id}</code> · <code>{workspace.constructor.name}</code>
        {info?.source === 'built-in' && ' · built-in'}
      </p>

      {!online && (
        <p className="flex items-center gap-2 mb-6 text-sm text-amber-700 dark:text-amber-300">
          <WifiOff size={16} /> This device is offline.
        </p>
      )}

      <Section title="Identities">
        {Object.entries(workspace.identities).map(([role, identity]) => (
          <IdentityRow key={role} role={role} identity={identity} signIn={() => signIn(identity)} />
        ))}
      </Section>

      <Section title="Services">
        {Object.entries(workspace.services).map(([name, service]) => (
          <ServiceRow key={name} workspace={workspace} name={name} service={service} online={online} signIn={signIn} />
        ))}
      </Section>

      <Section title="Data on this device">
        <div className="py-2">
          <WorkspaceDataActions workspace={workspace} />
        </div>
      </Section>
    </InfoCard>
  );
}
