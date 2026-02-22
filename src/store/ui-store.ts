'use client';

import { create } from 'zustand';
import type { StateCreator } from 'zustand';

type UiState = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
};

const uiStoreCreator: StateCreator<UiState> = (set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value })
});

export const useUiStore = create<UiState>(uiStoreCreator);
