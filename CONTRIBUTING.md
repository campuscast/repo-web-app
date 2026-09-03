# Contributing to CampusCast Web App

## Development setup

Use Node.js 20 and the pnpm version pinned in `package.json`:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

The UI expects the CampusCast API and WebSocket endpoints configured in `.env.local`. Authentication-dependent pages are not fully usable without the backend services.

## Change guidelines

- Keep domain work inside the matching module under `src/features/` and API calls under `src/services/`.
- Reuse schemas from `src/types/`, shared query keys, and existing UI primitives.
- Preserve the server-compatible cookie and refresh-token flow when changing authentication.
- Preserve `/api/v1/...` and `/ws/sync` integration contracts unless the coordinating backend change is part of the same work.
- Add focused tests for behavior that can be isolated from the full distributed stack.
- Document new environment variables in both `.env.example` and `README.md`.

Architectural context and security trade-offs are documented in `docs/engineering-guidelines.md`.

## Verification

Run the repository checks before requesting review:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If a baseline test is already failing, record the exact test name and show that the change introduces no additional failure. Do not describe a failing suite as passing.

For container changes:

```bash
docker build --tag campuscast/web-app:local .
```

## Pull requests

Keep each pull request focused and include:

- the user-visible or architectural outcome;
- verification commands and results;
- configuration or migration notes;
- known limitations that remain after the change.
