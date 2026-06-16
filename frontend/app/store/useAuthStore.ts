"use client";

import { create } from "zustand";
import {
  loginUser,
  registerUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
  type AuthUser,
} from "../utils/httpClient";

/* ═══════════════════════════════════════════════════════════════
   Auth Store — Zustand global auth state
   ═══════════════════════════════════════════════════════════════ */

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isModalOpen: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  tryRefresh: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  setUser: (user: AuthUser | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isModalOpen: false,

  login: async (email: string, password: string) => {
    const payload = await loginUser(email, password);
    set({
      user: payload.user,
      isAuthenticated: true,
      isModalOpen: false,
    });
  },

  register: async (email: string, password: string) => {
    const payload = await registerUser(email, password);
    set({
      user: payload.user,
      isAuthenticated: true,
      isModalOpen: false,
    });
  },

  logout: async () => {
    await logoutUser();
    set({
      user: null,
      isAuthenticated: false,
    });
  },

  tryRefresh: async () => {
    set({ isLoading: true });
    try {
      await refreshAccessToken();
      const user = await getCurrentUser();
      set({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
