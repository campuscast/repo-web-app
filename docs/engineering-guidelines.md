# Engineering Guidelines

This document records the architecture boundaries and trade-offs that are easy to miss when changing CampusCast Web App. Setup and verification commands live in `README.md` and `CONTRIBUTING.md`.

## System role

The web app is an administrative client for a distributed digital-signage prototype. It owns presentation and browser-side interaction state. Domain records, authorization decisions, schedule validation, signing, release generation, and device control remain backend responsibilities.

The UI should remain useful when an individual request fails: query errors need visible states, mutations need actionable feedback, and cached editing state must not be mistaken for server confirmation.

## Technology choices

| Technology | Role | Trade-off |
| --- | --- | --- |
| Next.js App Router | Routing, SSR, request rewrites, standalone build | Server and client module boundaries must remain explicit |
| React and TypeScript | UI and type-checked feature code | External payloads still require runtime validation |
| Tailwind CSS and shadcn/Radix components | Styling and accessible primitives | Some layout primitives use inline style properties |
| TanStack Query | Remote data and mutation state | Query keys and invalidation must stay consistent across features |
| Zustand | Authentication and local UI state | Server-owned records should not be duplicated here |
| Zod | Runtime validation of selected API contracts | Not every legacy response is covered yet |
| idb | Durable offline schedule-operation queue | Queued operations are not proof of server acceptance |

## Integration boundaries

### HTTP API

Browser API calls use the same-origin prefix configured by `NEXT_PUBLIC_API_PREFIX`, normally `/api/v1`. Service modules under `src/services/` own request construction. Keep components focused on interaction and rendering; do not add feature-specific `fetch` calls when a service module already owns that domain.

`src/services/api-client.ts` provides credentials, CSRF forwarding, timeout handling, one refresh-and-retry cycle, and standardized API errors. Changes to this client affect every authenticated feature and require login, expiry, deactivation, and non-JSON error checks.

### Authentication

Middleware protects non-public pages by checking the access or refresh cookie. Server handlers perform login, MFA, and logout; the server session loader and API client can refresh an expired access token. Preserve this server-compatible boundary when extending authentication.

Frontend permission checks improve navigation and interaction, but they are not an authorization boundary. Backend services must still enforce permissions.

### Schedule synchronization

The schedule editor supports locking and CRDT-oriented paths. `src/services/ws-client.ts` owns the `/ws/sync` protocol, while the local queue and schedule feature state live under `src/hooks/` and `src/features/schedules/`.

Operation acknowledgement, rejection, compensation, reconnect, and snapshot handling are distinct states. UI feedback must not label a locally queued operation as synchronized before acknowledgement.

### Media

Metadata and upload coordination use the content API. Preview URLs use `NEXT_PUBLIC_MINIO_PUBLIC_URL` and are intentionally browser-visible. Treat object keys as untrusted data and keep storage credentials on the server side.

## Layout architecture

Protected routes use the shared shell:

```text
AuthHydrator
└── AppShell
    ├── AppSidebar
    └── SidebarInset
        ├── Topbar
        └── page content
```

Relevant files:

| File | Responsibility |
| --- | --- |
| `src/app/(protected)/layout.tsx` | Authentication hydration and protected shell entry |
| `src/components/layout/app-shell.tsx` | Shell composition |
| `src/components/layout/app-sidebar.tsx` | Permission-aware navigation |
| `src/components/layout/topbar.tsx` | Shared header |
| `src/components/layout/navigation.ts` | Route metadata |

`SidebarProvider`, the sidebar, and `SidebarInset` participate in one layout calculation. Keep the top bar inside the inset. Diagnose provider/inset composition and CSS variables before adding fixed offsets or manual sidebar margins.

## State ownership

- TanStack Query owns backend-derived data and mutation lifecycle state.
- Zustand owns cross-route client state such as the authenticated session and UI preferences.
- Component state owns transient forms and interaction state.
- idb owns unsent schedule operations that must survive reloads.
- URL parameters own shareable route state such as the selected schedule date or view.

Avoid copying one value into multiple stores. When a deliberate cache exists, define which source wins after refresh and failure.

## Project structure

```text
src/app/          routes, layouts, and server handlers
src/auth/         session, cookie, and auth hydration logic
src/components/   shared shell and UI primitives
src/features/     domain-focused UI and interaction logic
src/hooks/        reusable browser behavior
src/lib/          environment, query keys, i18n, and utilities
src/services/     HTTP and WebSocket integration clients
src/store/        cross-route client state
src/types/        TypeScript models and Zod schemas
src/ws/           synchronization bridge
test/             focused Node test-runner checks
```

Prefer extending the established directory for a concern. A second API client, auth store, or WebSocket abstraction increases ambiguity and should come with an explicit migration plan.

## Content Security Policy

The CSP is applied by nginx in `repo-infra/docker/nginx/conf.d/default.conf`, not by `next.config.ts`. At the audited baseline it permits `unsafe-inline` and `unsafe-eval` for scripts in production, plus broad HTTP/HTTPS sources for several resource types.

That policy is a known security limitation, not a requirement of the application. Some components do rely on inline style attributes, so CSP changes require a rendered browser check. A safe tightening effort should:

1. capture violations in report-only mode;
2. verify Next.js hydration, login/MFA, navigation, media previews, and schedule editing;
3. separate development allowances from the production policy;
4. prefer nonces or hashes for required scripts;
5. document any source that remains broad and why.

Do not weaken the policy to fix an unexplained rendering issue. Identify the blocked resource or directive first.

## Verification boundaries

Unit-like tests under `test/` cover isolated state transformations and selected source contracts. They do not prove that the distributed backend is available or that browser rendering works. A production build proves compilation and route generation, not authenticated end-to-end behavior.

For integration-sensitive changes, record the backend services and browser paths exercised in addition to the repository commands. Keep baseline failures explicit so new regressions are distinguishable.
