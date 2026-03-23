import assert from 'node:assert/strict';
import test from 'node:test';
import { useAuthStore } from '../src/auth/store.ts';

function makeMePayload() {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      must_change_password: false,
    },
    roles: ['editor'],
    permissions: ['content.read', 'content.write'],
    zones: ['zone-a'],
    mfa_enabled: false,
    crdt_enabled: false,
  };
}

test('hydrateFromMe does not publish updates for identical heartbeat payload', () => {
  useAuthStore.getState().clear();

  let updates = 0;
  const unsubscribe = useAuthStore.subscribe(() => {
    updates += 1;
  });

  const first = makeMePayload();
  useAuthStore.getState().hydrateFromMe(first);
  assert.equal(updates, 1);

  const sameValuesNewRefs = {
    ...first,
    user: { ...first.user },
    roles: [...first.roles],
    permissions: [...first.permissions],
    zones: [...first.zones],
  };
  useAuthStore.getState().hydrateFromMe(sameValuesNewRefs);
  assert.equal(updates, 1);

  unsubscribe();
  useAuthStore.getState().clear();
});

test('hydrateFromMe publishes an update when payload actually changed', () => {
  useAuthStore.getState().clear();

  let updates = 0;
  const unsubscribe = useAuthStore.subscribe(() => {
    updates += 1;
  });

  const initial = makeMePayload();
  useAuthStore.getState().hydrateFromMe(initial);
  assert.equal(updates, 1);

  const changed = {
    ...initial,
    zones: ['zone-a', 'zone-b'],
  };
  useAuthStore.getState().hydrateFromMe(changed);
  assert.equal(updates, 2);

  unsubscribe();
  useAuthStore.getState().clear();
});
