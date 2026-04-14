import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      theme: "dark",

      setAuth: ({ token, user }) =>
        set({
          token,
          user,
          theme: user?.preferences?.theme || "dark",
        }),

      logout: () =>
        set({
          token: null,
          user: null,
          theme: "dark",
        }),

      setTheme: (theme) => set({ theme }),

      updateUserPreferences: (preferences) =>
        set((state) => ({
          user: state.user
            ? {
                ...state.user,
                preferences: { ...(state.user.preferences || {}), ...(preferences || {}) },
              }
            : state.user,
          theme: preferences?.theme ? preferences.theme : state.theme,
        })),
    }),
    {
      name: "focuspath_auth_v1",
      partialize: (state) => ({ token: state.token, user: state.user, theme: state.theme }),
    },
  ),
);

