// How workspaces look: titles, colors and labels belong to the UI, not to
// workspace classes. A record's presentation overrides these defaults.

import type { WorkspaceInfo } from '@/workspace/registry';

export interface Presentation {
  title: string;
  color: string;
  icon?: string;
}

const DEFAULT_COLOR = '#757575';

const BUILT_IN: Record<string, Omit<Presentation, 'icon'>> = {
  aiza: { title: 'Aiza', color: '#8e24aa' },
  dev: { title: 'Aiza (dev)', color: '#2e7d32' },
};

const COLOR = /^#[0-9a-f]{6}$/i;

export function presentationOf(info: Pick<WorkspaceInfo, 'id' | 'builtInId' | 'presentation'>): Presentation {
  const builtIn = info.builtInId && Object.hasOwn(BUILT_IN, info.builtInId) ? BUILT_IN[info.builtInId] : undefined;
  const own = info.presentation;
  return {
    title: own.title?.trim() || builtIn?.title || info.id,
    color: own.color && COLOR.test(own.color) ? own.color : builtIn?.color ?? DEFAULT_COLOR,
    ...(own.icon ? { icon: own.icon } : {}),
  };
}

// Labels of services and identity roles by the names workspace classes give
// them; unknown names are shown as they are.
const SERVICE_LABELS: Record<string, string> = {
  account: 'Aiza account',
  vault: 'Encrypted volume',
  dataVault: 'Vault data (assistant, file index)',
  serverSync: 'Syncthing on the server',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
};

export function serviceLabel(name: string): string {
  return Object.hasOwn(SERVICE_LABELS, name) ? SERVICE_LABELS[name] : name;
}

export function roleLabel(role: string): string {
  return Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role] : role;
}
