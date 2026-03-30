import assert from 'node:assert/strict';
import test from 'node:test';
import { createClientId, safeRandomUuid } from '../src/lib/id.ts';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('safeRandomUuid uses crypto.randomUUID when available', () => {
  const uuid = safeRandomUuid({
    randomUUID: () => '123e4567-e89b-12d3-a456-426614174000',
  });

  assert.equal(uuid, '123e4567-e89b-12d3-a456-426614174000');
});

test('safeRandomUuid falls back to getRandomValues when randomUUID is unavailable', () => {
  const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
  const uuid = safeRandomUuid({
    getRandomValues: (target) => {
      target.set(bytes);
      return target;
    },
  });

  assert.equal(uuid, '00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('safeRandomUuid falls back to pseudo-random bytes when crypto is unavailable', () => {
  const uuid = safeRandomUuid(undefined);
  assert.match(uuid, UUID_V4_RE);
});

test('createClientId prefixes generated UUID', () => {
  const clientId = createClientId('workspace', {
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
  });

  assert.equal(clientId, 'workspace-11111111-1111-4111-8111-111111111111');
});
