# repo-web-app

Web UI для Distributed Media CMS. Это отдельный репозиторий Next.js (App Router) с обязательным SSR, зонами доступа, dual-mode Schedule Editor (CRDT OFF/ON), upload/content management и publish+QA.

## Технологии

- Next.js App Router + SSR
- React + TypeScript (`strict`)
- TanStack Query
- Zustand
- Zod
- date-fns
- shadcn/ui-style components (`src/components/ui/*`)
- Animate UI style через `motion` (`src/components/animate-ui/fade-in.tsx`)
- ESLint + Prettier
- Docker multi-stage build
- Nginx reverse proxy config

## Быстрый запуск (локально)

1. Установить зависимости:
   - `npm ci`
2. Скопировать env:
   - `cp .env.example .env.local`
3. Запуск dev:
   - `npm run dev`
4. UI доступен на:
   - `http://localhost:3000`

## Запуск через Docker

1. Собрать контейнер:
   - `docker build -t repo-web-app:local .`
2. Запустить:
   - `docker run --rm -p 3000:3000 --env-file .env.local repo-web-app:local`

Для интеграции в общий compose используйте `docker-compose.snippet.yml`.

## Структура проекта

```text
repo-web-app/
  src/
    app/
      (protected)/
        admin/
          zones/page.tsx
          devices/page.tsx
        content/page.tsx
        schedules/
          page.tsx
          [scheduleId]/page.tsx
        layout.tsx
        page.tsx
      health/route.ts
      login/page.tsx
      globals.css
      layout.tsx
      providers.tsx
    auth/
      auth-hydrator.tsx
      csrf.ts
      guards.ts
      server-session.ts
      store.ts
      token-store.ts
    features/
      zones/zones-admin.tsx
      devices/devices-admin.tsx
      content/content-manager.tsx
      schedules/
        schedule-editor.tsx
        crdt-store.ts
    components/
      animate-ui/fade-in.tsx
      layout/site-shell.tsx
      ui/*.tsx
    lib/
      constants.ts
      env.ts
      query-keys.ts
      utils.ts
    services/
      api-client.ts
      auth-service.ts
      schedule-service.ts
      ws-client.ts
      zone-service.ts
      content-service.ts
      device-service.ts
      apiClient.ts
      authService.ts
      scheduleService.ts
      wsClient.ts
      zoneService.ts
      contentService.ts
    hooks/
      use-network-status.ts
      use-crdt-queue.ts
    ws/
      sync-bridge.ts
    types/
      api.ts
    store/
      ui-store.ts
  middleware.ts
  Dockerfile
  nginx/nginx.conf
  docker-compose.snippet.yml
```

## SSR-auth пример

- Серверная проверка сессии: `src/auth/server-session.ts`
- Гейт protected-страниц: `src/app/(protected)/layout.tsx`
- Redirect при отсутствии сессии: `redirect('/login')`
- Access token хранится только в памяти (`src/auth/token-store.ts`)
- Refresh выполняется через cookie (`credentials: 'include'`)

## Schedule Editor

### CRDT OFF

`src/features/schedules/schedule-editor.tsx`

- `lock` → `save` → `publish` → `unlock`
- показ `lock owner` и `TTL`
- fail-closed publish: при сигнатурной/QA ошибке успех не показывается

### CRDT ON

`src/features/schedules/schedule-editor.tsx`

- op-log в памяти (`useCrdtStore`)
- pending ops в IndexedDB (`useCrdtQueue`)
- online/offline индикатор (`useNetworkStatus`)
- WS sync client (`WsSyncClient`) + batch fallback через REST `/schedules/{id}/ops`
- reject + auto-transform reason отображаются
- `Revert last` доступен

## Безопасность

- Access token не сохраняется в `localStorage`
- Refresh только через cookie (`credentials: include`)
- 401 interceptor в `api-client.ts` делает refresh + retry
- CSRF header (`X-CSRF-Token`) подставляется из cookie
- logout очищает in-memory состояние
- WS bearer передаётся через subprotocol, Nginx маппит в `Authorization`

## Проверка соответствия требованиям

- Микросервисные границы: UI использует только `/api/v1/*` и `/ws/sync`.
- CRDT optional: режим берётся из `me.crdt_enabled` в auth store.
- Zone isolation: данные и действия фильтруются по `user.zones` (кроме admin).
- Fail-closed publish: сигнатурные/QA ошибки блокируют успех публикации.
- SSR: защищённые роуты валидируются сервером до рендера.

## Полезные команды

- `npm run lint`
- `npm run typecheck`
- `npm run build`
