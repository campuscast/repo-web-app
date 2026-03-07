'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UiState = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value })
    }),
    {
      name: 'campuscast-ui-store',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed })
    }
  )
);
