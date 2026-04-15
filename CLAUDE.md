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
- **app/ui/context/** - Modular context providers:
  - **AizaProvider.tsx** - Composes all providers (ServerConfig → Auth → Settings)
  - **ServerConfigContext.tsx** - Backend configuration, fetches `/info.json` and OpenID config, detects URL mismatch
  - **AuthContext.tsx** - OAuth2/PKCE authentication, token management, silent auth for secondary services
  - **SettingsContext.tsx** - User settings (theme: light/dark/system), MUI theme provider
- **app/ui/NavBar.tsx** - Responsive navigation header with mobile drawer, contains Auth component and BackendMismatchBanner
- **app/ui/Auth.tsx** - User menu component with login/logout and dev tools (press Alt while menu is open to reveal dev options)
- **app/ui/BackendMismatchBanner.tsx** - Warning banner when accessing from URL that doesn't match backend's expected `web` URL
- **app/ui/ThemeToggle.tsx** - Theme mode switcher component
- **app/cognito_redirect/page.tsx** - Handles OAuth callback, exchanges auth code for tokens

### Pages
- **app/page.tsx** - Home page
- **app/profile/page.tsx** - User profile page
- **app/about/page.tsx** - About page

### Authentication Flow
1. `login()` initiates PKCE flow, stores pending auth state, redirects to Cognito
2. `/cognito_redirect` receives callback, calls `handleOAuthCallback()`
3. Tokens stored in localStorage under `aiza_tokens` (keyed by issuer + client_id)
4. `getAccessToken(service)` returns valid token, auto-refreshes, or attempts silent auth for analytics service

### Backend Configuration
- **app/config/backends.ts** - Default backend URLs and auto-detection logic
- Server config stored in localStorage as `aiza_backend:{serverId}`
- Current backend stored as `aiza_current_backend`
- `connectTo(url)` fetches `/info.json` from backend, then OpenID config
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
