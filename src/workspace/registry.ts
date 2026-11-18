// Workspaces of this build and of this device.
//
// The first part declares what this build knows: the workspace classes it
// supports (by `Class.name`), how to create each of them and the built-in
// workspaces. Right below, listWorkspaces() and createWorkspace() use exactly
// these declarations. Adding a workspace class means adding its name, a
// `case` in newWorkspace() and, if it has built-in instances, their entries.
//
// A class migrates its own configuration when it is created (see
// Workspace.config); renamed or removed classes are not handled here.
//
// `aiza:workspaces` keeps one record per workspace ever opened on the device:
// which class builds it and the user's part of it. Runtime state, services
// and tokens are never part of a record.

import { getLastWorkspaceId, getStoredWorkspaces, setStoredWorkspaces, workspaceStorage } from '@/lib/storage';
import { UnsupportedWorkspace } from './UnsupportedWorkspace';
import type { Workspace } from './Workspace';
import { PersonalVaultWorkspace, type PersonalVaultConfig } from './personalVault/PersonalVaultWorkspace';

// --- This build's workspaces ---

// Names (`Class.name`) of the workspace classes this build supports; records
// store them as `type`. The production build keeps class names (vite.config.ts).
export const workspaceTypes: readonly string[] = [PersonalVaultWorkspace.name];

// Creates a workspace of a supported class. The config comes from a record or
// a built-in workspace, so it is cast to the class's config here; the class
// reads older formats itself.
export function newWorkspace(type: string, id: string, config: Record<string, unknown>): Workspace | null {
  switch (type) {
    case PersonalVaultWorkspace.name:
      return new PersonalVaultWorkspace(id, config as PersonalVaultConfig);
    default:
      return null;
  }
}

export interface BuiltInWorkspace {
  type: string;
  config: Record<string, unknown>;
}

// Workspaces the app defines, with ids that mean the same on every device:
// `/w/aiza` opens the same workspace wherever the link is followed. Their
// configuration comes from here only: a device stores no overrides for them
// (their services receive the owner's tokens, so an address must not be
// redirected elsewhere).
export const builtInWorkspaces: Readonly<Record<string, BuiltInWorkspace>> = {
  aiza: {
    type: PersonalVaultWorkspace.name,
    config: { api: 'https://aiza-be.bin932.com:3150' } satisfies PersonalVaultConfig,
  },
  // aiza-be run locally (`quarkus dev`) validates tokens of the aiza-dev user
  // pool (%dev profile of aiza-be application.properties).
  dev: {
    type: PersonalVaultWorkspace.name,
    config: { api: 'http://localhost:8080', identity: 'aizaDev' } satisfies PersonalVaultConfig,
  },
};

// Fail loudly rather than write minified class names to storage.
const TYPE_NAME = /^[A-Z][A-Za-z0-9]*Workspace$/;
for (const type of workspaceTypes) {
  if (!TYPE_NAME.test(type)) throw new Error(`Workspace class name "${type}" was mangled by the build`);
}

// --- Listing and creating workspaces ---

// UI preferences of a workspace; how they are shown is up to the UI.
export interface WorkspacePresentation {
  title?: string;
  color?: string;
  icon?: string;
}

export interface WorkspaceRecord {
  // Set for a built-in workspace (it is configured in code); absent for one
  // the user created.
  builtInId?: string;
  // `Class.name` of the workspace class.
  type: string;
  // The user's configuration; always empty for built-in workspaces.
  config: Record<string, unknown>;
  presentation?: WorkspacePresentation;
}

export interface WorkspaceInfo {
  id: string;
  builtInId?: string;
  // `Class.name` of the class that builds it (or the stored one, when unsupported).
  type: string;
  // Configuration the workspace is created with (class defaults aside).
  config: Record<string, unknown>;
  presentation: WorkspacePresentation;
  source: 'built-in' | 'custom';
  // `available`: this build can create it. Says nothing about whether its
  // services are reachable or whether it can sign in on this origin.
  status: 'available' | 'unsupported';
  unsupportedReason?: string;
  // Has a record: it was opened on this device.
  opened: boolean;
}

export class UnknownWorkspaceError extends Error {
  constructor(readonly workspaceId: string) {
    super(`No workspace "${workspaceId}" on this device`);
    this.name = 'UnknownWorkspaceError';
  }
}

// Every workspace the UI can offer: those opened on this device (supported
// or not), in the order they were first opened, then built-in ones never
// opened here. No network access.
export function listWorkspaces(): WorkspaceInfo[] {
  const stored = getStoredWorkspaces();
  const ids = [...Object.keys(stored), ...Object.keys(builtInWorkspaces).filter((id) => !Object.hasOwn(stored, id))];
  return ids.flatMap((id) => {
    const resolved = resolve(id, storedValue(stored, id));
    if (!resolved) return [];
    const { record, unsupportedReason } = resolved;
    return [{
      id,
      ...(record.builtInId !== undefined ? { builtInId: record.builtInId } : {}),
      type: resolved.type,
      config: resolved.config,
      presentation: record.presentation ?? {},
      source: record.builtInId !== undefined ? 'built-in' : 'custom',
      status: unsupportedReason ? 'unsupported' : 'available',
      ...(unsupportedReason ? { unsupportedReason } : {}),
      opened: Object.hasOwn(stored, id),
    } satisfies WorkspaceInfo];
  });
}

export function getWorkspaceInfo(id: string): WorkspaceInfo | undefined {
  return listWorkspaces().find((info) => info.id === id);
}

// Creates the runtime workspace `id` from its record and the built-in
// configuration (for a built-in workspace) or the user's (for one the user
// created). Saves the record on the first opening, and the configuration
// when the class migrated it. A record this build can't use gives an
// UnsupportedWorkspace; an id that is neither stored nor built-in throws
// UnknownWorkspaceError.
export function createWorkspace(id: string): Workspace {
  const stored = storedValue(getStoredWorkspaces(), id);
  const resolved = resolve(id, stored);
  if (!resolved) throw new UnknownWorkspaceError(id);
  const workspace = instantiate(id, resolved);
  if (workspace instanceof UnsupportedWorkspace) return workspace;

  const { record } = resolved;
  if (stored === undefined) {
    saveRecord(id, record);
  } else if (record.builtInId === undefined && workspace.config !== resolved.config) {
    saveRecord(id, { ...record, config: { ...workspace.config } });
  }
  return workspace;
}

// Instances of the workspaces opened on this device, without saving anything
// (e.g. to see which identities they share).
export function workspacesOnDevice(): Workspace[] {
  const stored = getStoredWorkspaces();
  return Object.keys(stored).flatMap((id) => {
    const resolved = resolve(id, stored[id]);
    return resolved ? [instantiate(id, resolved)] : [];
  });
}

// --- Reading records ---

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPresentation(value: unknown): WorkspacePresentation | undefined {
  if (!isObject(value)) return undefined;
  const p: WorkspacePresentation = {};
  if (typeof value.title === 'string') p.title = value.title;
  if (typeof value.color === 'string') p.color = value.color;
  if (typeof value.icon === 'string') p.icon = value.icon;
  return p;
}

// A stored value as a record, or null when it isn't one.
function readRecord(value: unknown): WorkspaceRecord | null {
  if (!isObject(value) || typeof value.type !== 'string') return null;
  const presentation = readPresentation(value.presentation);
  return {
    ...(typeof value.builtInId === 'string' ? { builtInId: value.builtInId } : {}),
    type: value.type,
    config: isObject(value.config) ? value.config : {},
    ...(presentation ? { presentation } : {}),
  };
}

function storedValue(stored: Record<string, unknown>, id: string): unknown {
  return Object.hasOwn(stored, id) ? stored[id] : undefined;
}

function builtInOf(id: string): BuiltInWorkspace | undefined {
  return Object.hasOwn(builtInWorkspaces, id) ? builtInWorkspaces[id] : undefined;
}

function saveRecord(id: string, record: WorkspaceRecord): void {
  setStoredWorkspaces({ ...getStoredWorkspaces(), [id]: record });
}

interface Resolved {
  record: WorkspaceRecord;
  // Class and configuration to create the workspace with: a built-in
  // workspace's come from code, whatever its record says.
  type: string;
  config: Record<string, unknown>;
  unsupportedReason?: string;
}

// Workspace `id` short of creating it; `stored` is what the device keeps for
// the id. Null for an id that is neither stored nor built-in.
function resolve(id: string, stored: unknown): Resolved | null {
  if (stored === undefined) {
    const builtIn = builtInOf(id);
    return builtIn ? { record: { builtInId: id, type: builtIn.type, config: {} }, type: builtIn.type, config: builtIn.config } : null;
  }

  const record = readRecord(stored);
  if (!record) {
    return { record: { type: '(unreadable)', config: {} }, type: '(unreadable)', config: {}, unsupportedReason: 'Its record is unreadable' };
  }
  const unsupported = (reason: string): Resolved => ({ record, type: record.type, config: record.config, unsupportedReason: reason });

  if (record.builtInId !== undefined) {
    const builtIn = builtInOf(record.builtInId);
    if (!builtIn) return unsupported(`This version of Aiza no longer has the built-in workspace "${record.builtInId}"`);
    return { record, type: builtIn.type, config: builtIn.config };
  }
  // A user's record can't take over the id of a built-in workspace (one added
  // by a later release): it is kept, but not opened.
  if (builtInOf(id)) return unsupported(`"${id}" is now the id of a built-in workspace`);
  if (!workspaceTypes.includes(record.type)) return unsupported(`This version of Aiza has no workspaces of type ${record.type}`);
  return { record, type: record.type, config: record.config };
}

// Creates the instance without touching storage.
function instantiate(id: string, { record, type, config, unsupportedReason }: Resolved): Workspace {
  if (unsupportedReason) return new UnsupportedWorkspace(id, record, unsupportedReason);
  return newWorkspace(type, id, config) ?? new UnsupportedWorkspace(id, record, `This version of Aiza can't create workspaces of type ${type}`);
}

// --- Workspaces of this device ---

const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

// Why `id` can't be used for a new workspace, or null if it can.
export function workspaceIdError(id: string): string | null {
  if (!WORKSPACE_ID.test(id)) return 'Use 2–40 lowercase letters, digits and dashes, starting with a letter or digit';
  if (builtInOf(id)) return `"${id}" is reserved by the app`;
  if (Object.hasOwn(getStoredWorkspaces(), id)) return `"${id}" is already used on this device`;
  return null;
}

// Saves a new workspace the user created from one of the classes of this
// build; `type` is its `Class.name`.
export function addWorkspace(id: string, type: string, config: Record<string, unknown>, presentation?: WorkspacePresentation): void {
  const error = workspaceIdError(id);
  if (error) throw new Error(error);
  if (!workspaceTypes.includes(type)) throw new Error(`${type} is not a workspace type of this build`);
  saveRecord(id, { type, config: { ...config }, ...(presentation ? { presentation } : {}) });
}

// Removes the record and every piece of data the workspace kept on this
// device. A built-in workspace stays available and starts afresh when opened.
export function deleteWorkspace(id: string): void {
  const { [id]: _removed, ...rest } = getStoredWorkspaces();
  setStoredWorkspaces(rest);
  workspaceStorage(id).clear();
}

// A workspace can be used only where the identity provider of each of its
// identities can redirect back to: elsewhere sign-in can't complete.
export function isAvailableHere(workspace: Workspace, origin: string = location.origin): boolean {
  return Object.values(workspace.identities).every((identity) => identity.redirectOrigins.includes(origin));
}

const PREFERRED_BUILT_IN_ID = import.meta.env.DEV ? 'dev' : 'aiza';

// The workspace `/` should open: the last opened one if it still exists, else
// the first one opened on this device that works here, else (first launch)
// a built-in one that works on this origin.
export function defaultWorkspaceId(): string | undefined {
  const infos = listWorkspaces();
  const lastId = getLastWorkspaceId();
  if (lastId && infos.some((info) => info.id === lastId && info.opened)) return lastId;

  const stored = getStoredWorkspaces();
  const usable = (info: WorkspaceInfo): boolean => {
    const resolved = resolve(info.id, storedValue(stored, info.id));
    return resolved !== null && !resolved.unsupportedReason && isAvailableHere(instantiate(info.id, resolved));
  };

  const opened = infos.filter((info) => info.opened);
  const builtIns = infos.filter((info) => !info.opened);
  return opened.find(usable)?.id
    ?? builtIns.find((info) => info.id === PREFERRED_BUILT_IN_ID && usable(info))?.id
    ?? builtIns.find(usable)?.id
    ?? opened[0]?.id
    ?? builtIns[0]?.id;
}
