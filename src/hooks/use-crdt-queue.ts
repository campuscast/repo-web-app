'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { openDB } from 'idb';
import type { ScheduleOp } from '@/types/api';

const DB_NAME = 'campuscast-crdt';
const STORE_NAME = 'pending-ops';

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'operationId' });
      }
    }
  });
}

type QueueItem = {
  operationId: string;
  scheduleId: string;
  op: ScheduleOp;
  createdAt: number;
};

export function useCrdtQueue(scheduleId: string) {
  const [pending, setPending] = useState<QueueItem[]>([]);

  const refresh = useCallback(async () => {
    const db = await getDb();
    const all = (await db.getAll(STORE_NAME)) as QueueItem[];
    setPending(all.filter((item) => item.scheduleId === scheduleId));
  }, [scheduleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enqueue = useCallback(
    async (op: ScheduleOp) => {
      const db = await getDb();
      await db.put(STORE_NAME, {
        operationId: op.causal.operation_id,
        scheduleId,
        op,
        createdAt: Date.now()
      } satisfies QueueItem);
      await refresh();
    },
    [refresh, scheduleId]
  );

  const dequeueMany = useCallback(
    async (operationIds: string[]) => {
      const db = await getDb();
      await Promise.all(operationIds.map((id) => db.delete(STORE_NAME, id)));
      await refresh();
    },
    [refresh]
  );

  const clearSchedule = useCallback(async () => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const all = (await tx.store.getAll()) as QueueItem[];

    for (const item of all) {
      if (item.scheduleId === scheduleId) {
        await tx.store.delete(item.operationId);
      }
    }

    await tx.done;
    await refresh();
  }, [refresh, scheduleId]);

  return useMemo(
    () => ({
      pending,
      enqueue,
      dequeueMany,
      clearSchedule
    }),
    [pending, enqueue, dequeueMany, clearSchedule]
  );
}
