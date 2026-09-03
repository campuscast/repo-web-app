# CampusCast Web App

CampusCast Web App is the browser-based administration interface for the CampusCast distributed digital-signage prototype. It gives operators one place to manage zones, screen groups, devices, media, publications, schedules, releases, audit events, users, and roles.

The application is a research-oriented prototype. Most screens and integration clients are implemented, but a useful end-to-end session requires the corresponding CampusCast backend services.

## Stack

- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS 4
- shadcn/ui, Radix UI, Animate UI, Hugeicons, and Lucide
- TanStack Query for server state and Zustand for client state
- Zod schemas, React Hook Form, and idb-backed offline scheduling support
- Node.js built-in test runner
- pnpm 10.30.3

## Implemented areas

- Cookie-based login, token refresh, MFA flow, and protected routes
- Zone, device, screen-group, user, and role administration screens
- Media library and publication editing
- Calendar/timeline schedule editing with lock and CRDT integration paths
- Release and audit views
- API proxying through `/api`, WebSocket sync, and a `/health` route
- Standalone Next.js Docker image

## Local development

Prerequisites:

- Node.js 20
- Corepack
- A reachable CampusCast backend for authenticated workflows

Install and start the app:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>. The root route redirects to `/login`; the unauthenticated health check is available at <http://localhost:3000/health>.

## Configuration

| Variable | Purpose | Local default |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | Product name displayed in the UI | `CampusCast CMS` |
| `NEXT_PUBLIC_API_PREFIX` | Browser API prefix | `/api/v1` |
| `NEXT_PUBLIC_WS_SYNC_URL` | Browser WebSocket endpoint | `ws://localhost/ws/sync` |
| `NEXT_PUBLIC_MINIO_PUBLIC_URL` | Public base URL used for media previews | `http://localhost:9000` |
| `BACKEND_BASE_URL` | Server-side rewrite destination for API, WebSocket, and health requests | `http://localhost` |

Only `NEXT_PUBLIC_*` values are exposed to browser code. Keep credentials and tokens out of these variables and out of tracked environment files.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

At the audited `master` baseline, lint, typecheck, and the production build succeed. The test command has three existing source-contract failures around schedule-editor i18n and selection behavior; they must not be reported as passing until the editor and those assertions are reconciled.

Build the container from this repository's root:

```bash
docker build --tag campuscast/web-app:local .
docker run --rm -p 3000:3000 \
  -e BACKEND_BASE_URL=http://host.docker.internal \
  campuscast/web-app:local
```

The health route can be checked without signing in:

```bash
curl --fail http://localhost:3000/health
```

## Integration model

Browser requests use the same-origin `/api/v1` prefix. Next.js rewrites `/api`, `/ws`, and `/health` to `BACKEND_BASE_URL`; production traffic is normally routed through nginx in `repo-infra`. Schedule collaboration connects separately through `NEXT_PUBLIC_WS_SYNC_URL`, and media previews use `NEXT_PUBLIC_MINIO_PUBLIC_URL`.

See `docs/engineering-guidelines.md` for the durable architecture decisions and `CONTRIBUTING.md` for the human contribution workflow.

## Known limitations

- The repository does not provide a mock backend or a one-command full-stack environment.
- Authenticated screens depend on backend cookies, permissions, and service availability.
- Several UI lint warnings remain, mainly around effect-driven state and image handling.
- Three schedule-editor source-contract tests fail on the audited `master` baseline.
- The current nginx configuration in `repo-infra` includes `unsafe-inline` and `unsafe-eval` in the production Content Security Policy. This is documented security debt; tightening it safely requires browser-level regression testing of authentication, Next.js hydration, media previews, and the animated layout.
