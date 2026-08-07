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
- **src/ui/RootLayout.tsx** - Root route component; wraps the app with `AizaProvider`, renders `NavBar`, the route `<Outlet />`, `Footer`, and (dev-only) the TanStack devtools panels
- **src/lib/storage.ts** - Single source of truth for every localStorage key; typed named accessors, no other file touches `localStorage` directly
- **src/ui/context/** - Modular context providers:
  - **AizaProvider.tsx** - Composes providers (ServerConfig → Auth)
  - **ServerConfigContext.tsx** - Backend configuration (fetches `/info.json` and OpenID config, detects URL mismatch, validates the JWT issuer against an allowlist) plus user settings (theme: light/dark/system, persisted per-server), and provides the MUI `ThemeProvider`
  - **backendClient.ts** - Backend/OpenID fetch functions and shared types (`InfoJson`, `OpenIdConfig`, `BackendUserInfo`, `OAuthUserInfo`, `TokenRevokedError`)
  - **AuthContext.tsx** - OAuth2/PKCE authentication and token management via `getApiAccessToken()`; dedupes concurrent refresh_token exchanges and distinguishes a network failure from a rejected refresh token so a token isn't dropped on a transient blip
- **src/ui/NavBar.tsx** - Responsive navigation header with mobile drawer, contains Auth component and BackendMismatchBanner
- **src/ui/Auth.tsx** - User menu component with login/logout, theme toggle, and backend switcher (prod/dev/custom, with history of previously-used custom backends)
- **src/ui/BackendMismatchBanner.tsx** - Warning banner when accessing from URL that doesn't match backend's expected `web` URL
- **src/ui/ThemeToggle.tsx** - Theme mode switcher component (reads/writes theme via `useServerConfig()`)
- **src/pages/CognitoRedirect.tsx** - Handles OAuth callback, exchanges auth code for tokens; reached via a real full-page redirect from Cognito, not client-side navigation (relevant to the GitHub Pages SPA-fallback setup in `.github/workflows/main.yml`)

### Authentication Flow
1. `login()` initiates PKCE flow, stores pending auth state, redirects to Cognito
2. `/cognito_redirect` receives callback, calls `handleOAuthCallback()`
3. Tokens stored in localStorage under `aiza_tokens` (keyed by issuer + client_id)
4. `getApiAccessToken()` returns a valid token for the `api` service, auto-refreshing it if expired; concurrent refreshes for the same token endpoint + client id are deduped into a single in-flight request

### Backend Configuration
- **src/config/backends.ts** - Default backend URLs, auto-detection logic, and backend type (dev/prod/custom)
- **src/config/issuerPinning.ts** - JWT issuer pinning (hardcoded per default backend, cached per custom backend in localStorage) used to reject a backend that returns an unexpected or spoofed issuer
- User settings (theme) stored in localStorage as `aiza_settings:{serverId}`
- Current backend stored as `aiza_current_backend`; custom backend history stored as `aiza_backend_history`
- `setBackendUrl(url)` (in `ServerConfigContext`) fetches `/info.json` from the backend, then its OpenID config, then validates the returned issuer against the allowlist
- Default backend auto-selected: dev (`localhost:8080`) when running on `localhost:5173` (Vite's default dev port), otherwise prod

### Styling
Uses a hybrid MUI + Tailwind approach:

- **MUI (Material UI)** - Complex interactive components:
  - Drawer, List components (NavBar mobile menu)
  - Menu, MenuItem (Auth dropdown)
  - TextField, InputAdornment (SearchBox)
  - ToggleButton, ToggleButtonGroup (ThemeToggle)
  - Alert, Button (BackendMismatchBanner)
- **Tailwind CSS** - Layout, spacing, typography, simple styling:
  - Use `dark:` prefix for dark mode variants
  - Responsive breakpoints via `md:`, `lg:` prefixes
- **Lucide React** - All icons (not MUI icons)
- **Dark mode** - Managed by SettingsContext:
  - MUI components get theme via ThemeProvider
  - Tailwind gets `dark` class on `<html>` element
  - Both systems stay in sync automatically
