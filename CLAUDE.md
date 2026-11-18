# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aiza is a personal AI assistant web application built with Vite, React 19, TypeScript, TanStack Router, and AWS Cognito authentication. It's a client-only SPA (no SSR), deployed as a static site to GitHub Pages.

## Commands

```bash
pnpm dev                                # Start development server (http://localhost:5173)
pnpm run build                          # Type-check and build for production
pnpm run typecheck                      # Type-check with tsc
pnpm run lint                           # Run oxlint
pnpm run check                          # Typecheck + lint
pnpm test                               # Run all tests with Vitest
pnpm test -- run src/ui/Auth.test.tsx     # Run a single test file (tests are co-located with source)
```

## Architecture

### App Structure
- **src/main.tsx** - Entry point; mounts `RouterProvider` into `#root` (see `index.html`)
- **src/router.tsx** - Thin `createRouter()` wired to `src/routeTree.gen.ts`, which `@tanstack/router-plugin` regenerates from `src/routes/` on every Vite run. Never edit it by hand, but do commit it: `pnpm run typecheck` and `pnpm run build` both start with `tsc -b`, which needs the file to already exist on a clean checkout.
- **src/routes/** - File-based route definitions (one file per route, each rendering a page component from `src/pages/`); includes `__root.tsx` for the root layout and not-found/error components
- **src/pages/** - Page components, independent of routing
- **src/ui/RootLayout.tsx** - Root route component; wraps the app with `AizaProvider` (QueryClient → `PreferencesProvider`), renders `NavBar`, the route `<Outlet />`, `Footer`, and (dev-only) the TanStack devtools panels
- **src/lib/storage.ts** - Single source of truth for every localStorage/sessionStorage key; typed named accessors, no other file touches Web Storage directly. Includes `workspaceStorage(id)` (prefix `aiza:ws:{id}:`) and `migrateLegacyStorage()` (run from `main.tsx`)
- **src/lib/jwt.ts** - `decodeJwtPayload`: base64url/UTF-8 JWT payload decoding that never throws
- **src/lib/staleChunkReload.ts** - Installed from `main.tsx`; on `vite:preloadError` (a tab opened before a deploy requests a lazy chunk that no longer exists) reloads the page once, with a sessionStorage cooldown so a genuinely missing chunk can't cause a reload loop
- **vite.config.ts** - Splits `node_modules` into `vendor-react`, `vendor-mui` and `vendor-tanstack` chunks so app-only deploys keep their filenames cached
- **src/auth/** - Sign-in and tokens, independent of React:
  - **identity.ts** - `IdentityConfig` (issuer, client id, IdP adapter, scopes, `redirectOrigins`: origins the IdP redirects back to)
  - **session.ts** - `Session` of an identity: generation `id`, claims, one `Grant` (refresh + access token) per scope set (`grantKey`); pure functions (`parseSession`, `tokensToGrant` with ID-token checks)
  - **sessionStore.ts** - `SessionStore`: sessions in `aiza:auth:sessions`, compare-and-set `update(identity, expectedId, …)`, change notifications (BroadcastChannel, `version`/`subscribe`)
  - **tokenBroker.ts** - `TokenBroker` singleton: PKCE sign-in followed by one `/authorize` per service scope set (silent for Cognito; confirmed by the user on `/cognito_redirect` for IdPs with a consent page), `getToken(identity, scopes)` from the grant of those scopes, refresh deduped in-tab and serialized per identity across tabs (Web Locks), writes only to the session generation they were made for, `forget` (local) vs `endSession` (IdP), both revoking the grants' refresh tokens
  - **discovery.ts** - OpenID discovery derived from the configured issuer; rejects a document naming another issuer
  - **idpAdapters.ts** - IdP specifics: `consentScreen` (whether a repeated `/authorize` may show a consent page), logout URL (Cognito: `logout_uri`)
  - **useIdentity.ts** - React view of an identity (`useSyncExternalStore` over the broker)
- **src/workspace/** - Workspaces (see `docs/workspace-architecture.md`):
  - **Workspace.ts** - Abstract `Workspace` class: id, per-workspace storage (`aiza:ws:{id}:`), query keys `['ws', id, ...]`, `identities`, `services`, `init`/`dispose`, `exportData`/`importData`. No UI metadata (titles, colors) in workspace classes
  - **personalVault/** - `PersonalVaultWorkspace(id, config)`: config type is the constructor parameter; clients of its services (`AccountClient`, `VaultClient`, …, in `clients.ts`) are typed properties built from it
  - **registry.ts** - First what this build knows, side by side: `workspaceTypes` (supported `Class.name`s; the build keeps class names, see `vite.config.ts`), `newWorkspace(type, id, config)` (a `switch` with an explicit `new` per class), `builtInWorkspaces` (`/w/aiza`, `/w/dev`; configured in code only, no user overrides). Then `listWorkspaces()` (built-in + custom + unsupported, no network) and `createWorkspace(id)` (resolve class and config, save the record on first opening and a config the class migrated; `UnsupportedWorkspace` for records this build can't create). Config formats are migrated by the class itself (`Workspace.config` is a new object only when it changed); renamed/removed classes are not handled here. Records in `aiza:workspaces`: `id -> { builtInId?, type, config, presentation? }`. A workspace is available only on origins all its identities redirect to (`isAvailableHere`). Adding a class: its name, a `case`, built-in entries
  - **WorkspaceManager.ts** - The tab's single active workspace: `open(id)` initializes it and disposes of the previous one; **useActiveWorkspace.ts** - React view of it
  - **identities.ts** - Identities in code (the trust anchor: nothing a backend reports at runtime configures the app)
  - **services/ServiceClient.ts** - Abstract base of service clients: each class declares its `scopes` (its token carries only these); endpoints shuffled per client with a sticky current one (failover round the ring on network errors, timeouts and 5xx, in memory only; non-safe methods only with an `Idempotency-Key`), per-attempt timeout, local 401 handling, optional `probe()`; failures are `ServiceRequestError`s (`kind`), caller cancellation stays an `AbortError`. There is no connection state machine
- **src/ui/workspacePresentation.ts** - Default title/color of built-in workspaces, service and role labels; a record's `presentation` overrides them
- **src/ui/NavBar.tsx** - Responsive navigation header with mobile drawer; contains `WorkspaceSwitcher` (active workspace with its status: online, IdP discovery; its menu: settings, the device's workspaces with the active one highlighted) and `Auth`
- **src/ui/Auth.tsx** - User menu: login, sign out of this workspace, logout (IdP end session), workspace settings, all workspaces, theme toggle
- **src/ui/context/PreferencesContext.tsx** - Device-wide preferences (theme) in `aiza:prefs`, MUI `ThemeProvider` and the Tailwind `dark` class
- **src/pages/CognitoRedirect.tsx** - Handles OAuth callback via `tokenBroker.handleCallback`; reached via a real full-page redirect from Cognito, not client-side navigation (relevant to the GitHub Pages SPA-fallback setup in `.github/workflows/main.yml`)

### Routes
- `/` - redirects to the last opened workspace (on first launch: `dev` under `pnpm dev`, `aiza` in builds)
- `/w/$workspaceId` - layout route: opens the workspace with `workspaceManager.open()` (following a link to a built-in workspace adds it to the device); unsupported or unavailable-here workspaces get a page with export/import/delete
- `/w/$workspaceId/` - workspace home; `/w/$workspaceId/settings` - identities and services with their state (service `probe()` on demand), data export/import/delete
- `/workspaces` - list of the device's workspaces
- `/cognito_redirect` - OAuth redirect URI (registered in the Cognito app client)

### Authentication Flow
1. `tokenBroker.login(identity, { requests, workspaceId, returnTo })` stores the pending flow in sessionStorage under `aiza:pending_auth:{state}` and redirects to the IdP with the identity's scopes. `requests` (`authorizationRequests()` in `src/workspace/signIn.ts`) are the scope sets of the workspace's *configured* services
2. `/cognito_redirect` calls `tokenBroker.handleCallback(...)`, which looks the flow up by `state` (unknown state = CSRF, no token request). The sign-in creates a new session; then each scope set gets its own `/authorize` and grant: right away for Cognito (no consent page), after the user's confirmation on that page for other IdPs. Finally it returns to `returnTo`; an IdP `error` returns without a grant
3. Sessions are stored in localStorage under `aiza:auth:sessions`
4. `tokenBroker.getToken(identity, scopes)` returns a valid token of the grant for those scopes, refreshing it if needed (IdPs keep a grant's scopes on refresh); no grant = `NeedsConsentError` (the settings page offers "Authorize"), a rejected refresh drops only that grant, a network error keeps the session

### Styling
Uses a hybrid MUI + Tailwind approach:

- **MUI (Material UI)** - Complex interactive components:
  - Drawer, List components (NavBar mobile menu)
  - Menu, MenuItem (Auth dropdown)
  - TextField, InputAdornment (SearchBox)
  - ToggleButton, ToggleButtonGroup (ThemeToggle)
  - Button (workspace settings actions), Tooltip (WorkspaceSwitcher)
- **Tailwind CSS** - Layout, spacing, typography, simple styling:
  - Use `dark:` prefix for dark mode variants
  - Responsive breakpoints via `md:`, `lg:` prefixes
- **Lucide React** - All icons (not MUI icons)
- **Dark mode** - Managed by PreferencesContext:
  - MUI components get theme via ThemeProvider
  - Tailwind gets `dark` class on `<html>` element
  - Both systems stay in sync automatically
