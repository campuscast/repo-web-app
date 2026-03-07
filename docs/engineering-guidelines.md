# Engineering Guidelines

This document defines the architectural constraints, technology stack, and operational rules for the **repo-web-app** project.

All contributors (human or AI agents such as Claude Code, Codex, etc.) must follow these guidelines.
Deviation from these rules is not allowed unless explicitly approved.

---

## Technology Stack (Must Be Preserved)

The following technologies are core to the system and **must not be replaced or removed**:

| Technology           | Role                                                        |
| -------------------- | ----------------------------------------------------------- |
| Next.js (App Router) | Framework, SSR, routing                                     |
| React                | UI rendering                                                |
| TypeScript           | Type safety                                                 |
| Tailwind CSS v4      | Styling (CSS-first config)                                  |
| shadcn/ui            | Base UI component library                                   |
| Animate UI           | Animated interactive components (sidebar, tooltips, sheets) |
| TanStack Query       | Server state / data fetching                                |
| Zustand              | Client state management                                     |
| Zod                  | Schema validation                                           |
| pnpm                 | Package manager                                             |

Existing integration points that must remain unchanged:

- API client communicating with `/api/v1/...`
- WebSocket sync system communicating with `/ws/sync`
- JWT auth with refresh tokens (SSR-compatible)
- CRDT-based schedule editor

---

## Architecture Constraints

The following changes are **NOT allowed**:

- Migrating the project to another framework or stack
- Removing existing business logic (services, auth, stores, schemas)
- Breaking existing routes
- Breaking auth/session/SSR behavior
- Breaking API client usage
- Breaking WebSocket sync
- Removing Zustand stores
- Removing Zod schemas
- Recreating the project from scratch
- Rewriting all pages from zero

These rules exist because the repository is part of a larger distributed system with multiple backend microservices.

---

## Allowed Changes

The following modifications **are allowed**:

- Updating the layout shell (app-shell, sidebar, topbar)
- Restructuring sidebar/topbar composition
- Improving UI structure and component composition
- Aligning UI components with official documentation
- Fixing CSS/layout issues
- Adding new pages or features
- Updating dependencies (with care for breaking changes)

UI changes must follow official component documentation (see below).

---

## UI Libraries Used

### 1. shadcn/ui

This is the base UI system used by the project.

Configuration (defined in `components.json`):

- **Style**: Nova (radix-nova)
- **Base color**: Neutral
- **Theme**: Indigo (oklch)
- **Font**: Noto Sans
- **Radius**: Small (0.45rem)
- **Icon library**: HugeIcons / Lucide

shadcn/ui components are based on Radix UI primitives and are located in `src/components/ui/`.

**Official documentation**: <https://ui.shadcn.com/docs>

### 2. Animate UI

Animate UI is used for interactive UI components including:

- Sidebar (with collapse, rail, mobile sheet)
- Animated tooltip
- Sheet (animated drawer)
- Highlight effects
- Sliding number

Animate UI components are located in `src/components/animate-ui/`.

**Official documentation**: <https://animate-ui.com/docs>

**Sidebar documentation**: <https://animate-ui.com/docs/components/radix/sidebar>

All sidebar-related layout behavior must follow the canonical Animate UI patterns.

---

## Layout Architecture

The application layout uses the Animate UI sidebar pattern.

### Canonical layout structure

```
SidebarProvider
  ├── Sidebar (AppSidebar)
  └── SidebarInset
        ├── Topbar (header)
        └── Page content (div)
```

### Key files

| File                                    | Purpose                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `src/components/layout/app-shell.tsx`   | Root layout shell (SidebarProvider + Sidebar + SidebarInset) |
| `src/components/layout/app-sidebar.tsx` | Sidebar with navigation                                      |
| `src/components/layout/topbar.tsx`      | Sticky header inside SidebarInset                            |
| `src/components/layout/navigation.ts`   | Navigation items and path titles                             |
| `src/app/(protected)/layout.tsx`        | Protected route layout (AuthHydrator + AppShell)             |

### Critical layout rules

1. `SidebarProvider` wraps both `Sidebar` and `SidebarInset`
2. `SidebarInset` is a **required** layout container — it provides `flex-1` and `min-w-0` and participates in the flex/peer mechanics with the sidebar gap spacer
3. **Never replace `SidebarInset` with a React Fragment** (`<>`) — this breaks layout calculations
4. Topbar lives **inside** `SidebarInset`, not outside it
5. No `position: fixed` on topbar — the sidebar container is already fixed
6. The sidebar reserves space via a gap spacer div with `w-[var(--sidebar-width)]`

---

## Project Structure

```
src/
  app/                    # Next.js App Router pages
    (protected)/          # Auth-guarded routes (use AppShell layout)
    login/                # Public login page
  auth/                   # Auth subsystem (store, guards, session, tokens)
  components/
    animate-ui/           # Animate UI components (installed via shadcn CLI)
    common/               # Shared page components (PageHeader, DataTable, etc.)
    layout/               # Layout shell (AppShell, AppSidebar, Topbar)
    ui/                   # shadcn/ui components
  features/               # Feature modules (UI + logic per domain)
  hooks/                  # Custom React hooks
  lib/                    # Utilities, constants, env config
  services/               # API client and service modules
  store/                  # Zustand stores
  types/                  # Zod schemas and TypeScript types
  ws/                     # WebSocket sync bridge
middleware.ts             # Auth middleware (root level)
```

---

## Docker Workflow

The project runs behind an nginx reverse proxy in a Docker environment managed by `repo-infra/docker-compose.yml`.

### After modifying frontend code

```bash
cd repo-infra

# Rebuild and restart web-app
docker-compose up -d --build web-app

# If nginx configuration changed
docker-compose restart nginx
```

### Full no-cache rebuild (if cached layers are stale)

```bash
docker-compose build --no-cache web-app
docker-compose up -d web-app
```

### Important notes

- The web-app Dockerfile uses multi-stage build: deps → builder → runner (standalone)
- `.dockerignore` excludes `node_modules`, `.next`, `.git`, `_legacy_backup`
- The web-app container listens on port 3000 internally
- External access is through nginx on port 3000 (mapped to nginx port 80)

---

## Content Security Policy (Important)

The nginx reverse proxy applies a Content Security Policy header.

Some UI libraries (including Animate UI) rely on **inline `style` attributes** to define CSS variables (e.g., `--sidebar-width: 16rem` on `SidebarProvider`).

If the CSP blocks inline styles, layout features like the sidebar width calculation will break silently — the sidebar gap spacer gets width 0 and page content slides under the sidebar.

**Required CSP directives for the web-app:**

```
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
```

The nginx config is located at: `repo-infra/docker/nginx/conf.d/default.conf`

---

## Development Commands

```bash
pnpm dev            # Start dev server on port 3000
pnpm lint           # Run ESLint (0 errors expected, warnings OK)
pnpm typecheck      # Run tsc --noEmit
pnpm build          # Production build (Turbopack)
```

---

## Rules For AI Agents

AI agents working in this repository must:

1. **Read this document** before making architectural changes
2. **Preserve the defined technology stack** — do not swap libraries
3. **Follow official documentation** for UI components (shadcn/ui, Animate UI)
4. **Never remove `SidebarInset`** or replace it with a fragment
5. **Never add layout hacks** (manual margin-left, padding-left for sidebar offset)
6. **Run lint, typecheck, and build** after changes (`pnpm lint && pnpm typecheck && pnpm build`)
7. **Rebuild Docker** after code changes (`docker-compose up -d --build web-app`)
8. **Avoid destructive refactors** — fix specific issues, don't rewrite entire modules
9. **Check the CSP** if layout looks broken in Docker but works locally

If a task conflicts with these rules, the task must be rejected or escalated.
