'use client';

import { create } from 'zustand';
import type { ScheduleOp } from '@/types/api';

type RejectedOp = {
  operation_id: string;
  reason: string;
  explanation?: string;
};

type TransformReason = {
  operation_id: string;
  reason: string;
};

type CrdtState = {
  ops: ScheduleOp[];
  rejected: RejectedOp[];
  transforms: TransformReason[];
  pushOp: (op: ScheduleOp) => void;
  setRejected: (item: RejectedOp) => void;
  setTransform: (item: TransformReason) => void;
  revertLast: () => void;
  clearAll: () => void;
};

export const useCrdtStore = create<CrdtState>((set) => ({
  ops: [],
  rejected: [],
  transforms: [],
  pushOp: (op) => set((state) => ({ ops: [...state.ops, op] })),
  setRejected: (item) => set((state) => ({ rejected: [item, ...state.rejected].slice(0, 20) })),
  setTransform: (item) => set((state) => ({ transforms: [item, ...state.transforms].slice(0, 20) })),
  revertLast: () => set((state) => ({ ops: state.ops.slice(0, -1) })),
  clearAll: () => set({ ops: [], rejected: [], transforms: [] })
}));
