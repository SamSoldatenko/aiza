# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aiza is a personal AI assistant web application built with Next.js 16 (App Router), React 19, TypeScript, and AWS Cognito authentication.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run test     # Run all tests with Vitest
npm test -- __tests__/Auth.test.tsx  # Run a single test file
```

## Architecture

### App Structure
- **app/layout.tsx** - Root layout wraps entire app with `AizaProvider` and renders `NavBar`
- **app/lib/storage.ts** - Single source of truth for every localStorage key; typed named accessors, no other file touches `localStorage` directly
- **app/ui/context/** - Modular context providers:
  - **AizaProvider.tsx** - Composes providers (ServerConfig → Auth)
  - **ServerConfigContext.tsx** - Backend configuration (fetches `/info.json` and OpenID config, detects URL mismatch, validates the JWT issuer against an allowlist) plus user settings (theme: light/dark/system, persisted per-server), and provides the MUI `ThemeProvider`
  - **backendClient.ts** - Backend/OpenID fetch functions and shared types (`InfoJson`, `OpenIdConfig`, `BackendUserInfo`, `OAuthUserInfo`, `TokenRevokedError`)
  - **AuthContext.tsx** - OAuth2/PKCE authentication and token management via `getApiAccessToken()`; dedupes concurrent refresh_token exchanges and distinguishes a network failure from a rejected refresh token so a token isn't dropped on a transient blip
- **app/ui/NavBar.tsx** - Responsive navigation header with mobile drawer, contains Auth component and BackendMismatchBanner
- **app/ui/Auth.tsx** - User menu component with login/logout, theme toggle, and backend switcher (prod/dev/custom, with history of previously-used custom backends)
- **app/ui/BackendMismatchBanner.tsx** - Warning banner when accessing from URL that doesn't match backend's expected `web` URL
- **app/ui/ThemeToggle.tsx** - Theme mode switcher component (reads/writes theme via `useServerConfig()`)
- **app/cognito_redirect/page.tsx** - Handles OAuth callback, exchanges auth code for tokens

### Pages
- **app/page.tsx** - Home page
- **app/profile/page.tsx** - User profile page
- **app/about/page.tsx** - About page

### Authentication Flow
1. `login()` initiates PKCE flow, stores pending auth state, redirects to Cognito
2. `/cognito_redirect` receives callback, calls `handleOAuthCallback()`
3. Tokens stored in localStorage under `aiza_tokens` (keyed by issuer + client_id)
4. `getApiAccessToken()` returns a valid token for the `api` service, auto-refreshing it if expired; concurrent refreshes for the same token endpoint + client id are deduped into a single in-flight request

### Backend Configuration
- **app/config/backends.ts** - Default backend URLs, auto-detection logic, and backend type (dev/prod/custom)
- **app/config/issuerPinning.ts** - JWT issuer pinning (hardcoded per default backend, cached per custom backend in localStorage) used to reject a backend that returns an unexpected or spoofed issuer
- User settings (theme) stored in localStorage as `aiza_settings:{serverId}`
- Current backend stored as `aiza_current_backend`; custom backend history stored as `aiza_backend_history`
- `setBackendUrl(url)` (in `ServerConfigContext`) fetches `/info.json` from the backend, then its OpenID config, then validates the returned issuer against the allowlist
- Default backend auto-selected: dev (`localhost:8080`) when running on `localhost:3000`, otherwise prod

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
