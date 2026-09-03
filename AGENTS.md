# Repository instructions

Use the pinned pnpm version from `package.json` and keep `pnpm-lock.yaml` synchronized with dependency changes.

Read `docs/engineering-guidelines.md` before changing authentication, API or WebSocket contracts, the protected layout, state ownership, media delivery, or Content Security Policy. Preserve those documented boundaries unless the task explicitly changes the architecture.

Keep changes scoped. Extend existing feature, service, schema, store, and UI patterns instead of introducing parallel abstractions. Treat `.env.example` as names and safe local defaults only; keep credentials out of tracked files.

For code changes, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Report every failure and distinguish a baseline failure from a regression. For Docker changes, also build the image from the repository root.

Update human-facing setup or operational guidance in `README.md` or `CONTRIBUTING.md`; keep agent-only execution constraints here.
