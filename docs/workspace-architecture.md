# Workspace Architecture

## Overview

Implement a lightweight workspace architecture for a TypeScript SPA. The application supports multiple workspace types but only one active workspace at a time.

A workspace is a runtime object that encapsulates its state, services, authentication tokens, and configuration.

Keep the architecture simple. Do not introduce unnecessary abstractions, dependency injection frameworks, string-based type registries, or separate configuration interfaces unless they become necessary.

## 1. Workspace Classes

- `Workspace` is the abstract base class defining the common workspace lifecycle and capabilities.
- Concrete workspace types extend `Workspace`, e.g. `WarehouseMonitoringWorkspace` and `AcmeArchiveWorkspace`.
- Each concrete class owns its configuration, state, and services.
- Configuration types should preferably be inferred from constructor parameters or class defaults rather than declared as separate interfaces.
- Workspace classes must not contain UI-specific metadata such as titles, icons, or colors.
- Common capabilities should include initialization, disposal, and user data import/export.

Example:

```typescript
class WarehouseMonitoringWorkspace extends Workspace {
  readonly documentStore: DocumentStore;

  constructor(id: string, readonly config: {
    endpoint: string;
  }) {
    super(id);
    this.documentStore = new DocumentStore(config.endpoint);
  }
}
```

## 2. Built-in Workspaces

The SPA defines built-in workspace instances in source code:

```typescript
const builtInWorkspaces = {
  'acme-materials': {
    type: WarehouseMonitoringWorkspace,
    config: {
      endpoint: 'https://materials.acme.com/api/warehouse'
    }
  },
  'acme-product': {
    type: WarehouseMonitoringWorkspace,
    config: {
      endpoint: 'https://products.acme.com/api/warehouse'
    }
  }
};
```

Multiple workspace instances can use the same workspace class with different configurations.

Users can also create their own workspace instances using any supported workspace class.

The configuration of a built-in workspace comes from source code only: users cannot override it (they can change its presentation). Its services receive the owner's tokens (each with that service's scopes), so a user override of an address would hand such a token to another server.

Services cannot define, sign or distribute workspace configurations. Workspaces are always defined by the SPA's code; in the future some services may provide configuration *values* for a workspace defined in code.

## 3. Persisted Workspace Records

Store workspace records in localStorage (or another suitable browser storage).

Example:

```typescript
{
  'acme-materials': {
    builtInId: 'acme-materials',
    type: 'WarehouseMonitoringWorkspace',
    config: {},
    presentation: {
      color: '#d32f2f',
      icon: 'database'
    }
  },
  'my-grain-storage': {
    type: 'WarehouseMonitoringWorkspace',
    config: {
      endpoint: 'https://grain-storage.example.com/api/warehouse'
    }
  }
}
```

Record properties:

- `builtInId` identifies a built-in workspace. It is absent for user-created workspaces.
- `type` stores the workspace class name (`Class.name`).
- `config` stores user overrides, not a serialized runtime object. Always empty for built-in workspaces.
- `presentation` stores optional UI preferences, such as color and icon.

A record must be created when a workspace is first opened, even if the user has not changed its configuration.

Do not serialize runtime state, service instances, or authentication tokens as part of the workspace record.

## 4. Workspace Type Registry

Maintain a registry of workspace classes available in the current SPA version: the list of their names and one function that creates each of them explicitly.

```typescript
const workspaceTypes = [
  WarehouseMonitoringWorkspace.name,
  AcmeArchiveWorkspace.name
];

function newWorkspace(type: string, id: string, config: Record<string, unknown>): Workspace | null {
  switch (type) {
    case WarehouseMonitoringWorkspace.name:
      return new WarehouseMonitoringWorkspace(id, config as WarehouseMonitoringConfig);
    case AcmeArchiveWorkspace.name:
      return new AcmeArchiveWorkspace(id, config as AcmeArchiveConfig);
    default:
      return null;
  }
}
```

Built-in workspaces name their class the same way (`type: WarehouseMonitoringWorkspace.name`) and check their configuration with `satisfies`. The config type is an alias derived from the constructor (`NonNullable<ConstructorParameters<typeof C>[1]>`), not a separate interface. The list of names, `newWorkspace()`, the built-in workspaces, `listWorkspaces()` and `createWorkspace()` live next to each other.

Resolve a saved workspace type by matching its stored `type` against `Class.name`.

Do not introduce additional type identifiers such as `kind`.

## 5. Listing Workspaces

Implement:

```typescript
function listWorkspaces(): WorkspaceInfo[];
```

This function provides the UI with a unified list of:

- Built-in workspaces.
- User-created workspaces.
- Previously saved workspaces whose implementation is no longer available.

Each entry should include:

- ID.
- Workspace type, if supported.
- Effective configuration.
- Presentation preferences.
- Source (`built-in` or `custom`).
- Status (`available` or `unsupported`).

The function should merge built-in definitions with persisted records without allowing user records to overwrite built-in definitions.

Built-in workspaces that have never been opened should also appear in the list.

Do not perform remote connectivity checks while listing workspaces. `available` means that the workspace implementation is supported by the current application, not necessarily that its remote service is reachable.

Unsupported records must remain visible and must not be deleted automatically.

## 6. Opening and Creating Workspaces

Implement:

```typescript
function createWorkspace(id: string): Workspace;
```

The function should:

1. Load the persisted record.
2. Resolve the workspace class.
3. For built-in workspaces, load the current built-in definition.
4. Take the configuration:
   - Class defaults, if applicable (constructor default parameters).
   - Current built-in configuration, for built-in workspaces.
   - Persisted user configuration, for user-created workspaces.
5. Create and return the runtime workspace instance. The class migrates a configuration of an older format itself and exposes the result as `config`.
6. Persist the record if this is the first opening, or the migrated configuration of a user-created workspace.

If the stored class name cannot be resolved, create an `UnsupportedWorkspace` instead.

`UnsupportedWorkspace` should preserve the original record and provide common capabilities such as data import/export and record deletion, but must not expose type-specific services.

Configuration formats are migrated when a workspace is opened, by its class. Renamed and removed classes are not handled by `createWorkspace()`: separate code will take care of them.

## 7. Workspace Manager

Implement a small `WorkspaceManager` responsible for managing the single active workspace.

Its responsibilities:

- Open a workspace by ID.
- Initialize the new instance.
- Dispose of the previous active instance.
- Set the new active workspace.
- Persist its record.
- Close the active workspace.

Keep workspace creation separate from activation where practical.

Only one workspace instance should be active at a time.

## 8. Separation of Responsibilities

Maintain the following boundaries:

| Component | Responsibility |
|---|---|
| Workspace subclasses | Business logic, state, services, configuration |
| `builtInWorkspaces` | Built-in workspace instances and default configuration |
| `workspaceTypes` | Workspace classes supported by the current SPA |
| `listWorkspaces()` | Unified catalog for the UI |
| `createWorkspace()` | Configuration resolution, instance creation, saving records |
| `UnsupportedWorkspace` | Handling records with unavailable implementations |
| `WorkspaceManager` | Active workspace lifecycle |
| UI | Titles, icons, colors, forms, presentation and user interaction |
| localStorage | Persisted workspace records and user overrides |

## Design Principles

- Prefer straightforward TypeScript over generic frameworks.
- Keep workspace classes independent of UI concerns.
- Use class names as persisted type identifiers.
- Preserve unsupported workspace records.
- Never persist runtime objects or credentials as ordinary workspace configuration.
- Keep built-in and user-created workspaces conceptually distinct, while presenting them through one unified catalog.
- Avoid premature abstractions. Introduce additional interfaces, schemas, or configuration machinery only when justified by actual requirements.

## Implementation in Aiza

| Concept | Where |
|---|---|
| `Workspace`, `WorkspaceData` | `src/workspace/Workspace.ts` |
| `UnsupportedWorkspace` | `src/workspace/UnsupportedWorkspace.ts` |
| `PersonalVaultWorkspace` and its service clients | `src/workspace/personalVault/` |
| `ServiceClient`, `ServiceRequestError` | `src/workspace/services/ServiceClient.ts` |
| `workspaceTypes`, `newWorkspace()`, `builtInWorkspaces`, then records, `listWorkspaces()`, `createWorkspace()` | `src/workspace/registry.ts` |
| `WorkspaceManager` (`workspaceManager` singleton per tab) | `src/workspace/WorkspaceManager.ts` |
| Identities (issuer, client id, redirect origins) | `src/workspace/identities.ts` |
| Presentation defaults, service and role labels | `src/ui/workspacePresentation.ts` |

### Identities

Identities are part of the code, like workspaces: an identity names its issuer, client id, IdP adapter and the origins its IdP redirects back to (`redirectOrigins`). A workspace can be used only on origins all its identities redirect to (`isAvailableHere`), so there is no separate build environment. `aiza` signs in with the `aiza-users` pool and `dev` with the `aiza-dev` pool (whose tokens aiza-be run locally accepts); both work on `localhost:5173` and `aiza.bin932.com`. A workspace configuration can only name one of the identities defined in code (`knownIdentities`), never define one. Nothing a backend reports at runtime configures sign-in.

### Services

A workspace class creates clients of its services in its constructor and exposes them as typed properties (`workspace.vault.unlock()`), and by name in `services` for pages that show every service. A client is a subclass of the abstract `ServiceClient` (`AccountClient`, `VaultClient`, …): endpoints with failover, the identity it signs in with, the scopes it needs, and a 401 handling local to the service.

#### Scopes and grants

Access is divided by scopes, not audiences: the SPA is one OAuth client, and each class of client declares the scopes its service needs (`readonly scopes = ['bin932.vault/unlock', …]`). The token a client sends carries those scopes (plus the identity's own, such as `openid`) and nothing else, so a token leaked by one service is useless to another.

IdPs don't narrow scopes on refresh (Cognito and Clerk both ignore `scope` in a refresh request), so each scope set gets a grant of its own, from its own `/authorize`; its refresh token keeps those scopes. Right after sign-in the broker makes one `/authorize` per scope set of the workspace's configured services:

- Cognito answers a repeated `/authorize` without any page while its session cookie lives (1 hour), so the chain runs on its own;
- IdPs that may show a consent page (`oidc` adapter, e.g. Clerk) get a step on `/cognito_redirect` listing the services, and the next `/authorize` starts when the user continues (or the rest is skipped).

A service whose grant is missing (added later, skipped, revoked) reports `needs-consent`; the workspace settings page offers "Authorize", an `/authorize` for that service's scopes only. Sign-out revokes the refresh tokens of every grant.

#### Endpoints

Endpoints are interchangeable replicas. A client shuffles them once when it is created, so clients (tabs, devices, services) start on different replicas and fail over in different orders. The endpoint that answered becomes the client's current one and sticks: later requests start from it. After a network error, a timeout (15 s per attempt) or a 5xx the request moves on round the ring, trying each endpoint once; a 4xx is authoritative and doesn't fail over.

Only a request that may be repeated fails over: `GET`, `HEAD` and `OPTIONS`, and any other method only with an `Idempotency-Key` header (the service recognizes the repetition). Without one a `POST`/`PUT`/`PATCH`/`DELETE` gets a single attempt, since the first replica may have carried it out; the next request starts from the next endpoint. A request cancelled by the caller is not retried and rejects with an `AbortError`. The current endpoint lives only as long as the client (nothing is stored).

#### Failures

There is no general connection state machine:

- operations simply fail (`ServiceRequestError` with `kind` `unconfigured`, `network`, `needs-login`, `needs-consent`, `unauthorized`, `forbidden` or `error`);
- what is clear from code and data is shown as is: a service without an address is *not configured* (no grant is requested for it), an identity that is signed out needs sign-in, a missing grant needs authorization;
- a service may offer `probe()`, a cheap check the workspace page runs on demand;
- the browser's online/offline state is shown separately.

Connection states of streaming APIs (SSE, WebSocket) will belong to the services that use them.

### Records and configuration migrations

`aiza:workspaces` maps workspace ids to records. A built-in workspace gets its record when it is first opened (e.g. by following `/w/aiza` from another device). Ids of built-in workspaces are reserved; a user's record found under such an id (a built-in added by a later release) is kept and shown as unsupported.

A class whose configuration format changed reads the older format in its constructor and keeps the current one in `config`; when nothing had to change it keeps the very object it was given. `createWorkspace()` saves a different `config` to the record of a user-created workspace (built-in ones are configured by code and never store a config). Listing shows records as stored.

Class names are persisted, so the production build keeps them (`minify.*.keepNames.class` in `vite.config.ts`); `registry.ts` throws at load if a name looks mangled.

### Routing and the active workspace

The `/w/$workspaceId` route opens the workspace through `workspaceManager.open()` in `beforeLoad`; React reads the active workspace with `useActiveWorkspace()` / `useWorkspace()`. The workspace stays active on pages outside `/w/…`. Tabs are independent: each has its own manager and may show a different workspace.

### Workspace data

`exportData()` / `importData()` carry what the workspace keeps under `aiza:ws:{id}:` (never tokens: sessions belong to identities). The workspace page and the page of an unsupported workspace offer export, import and deletion from the device.
