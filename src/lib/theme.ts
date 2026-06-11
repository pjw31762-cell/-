import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";
const KEY = "themeMode";
const listeners = new Set<() => void>();

const read = (): ThemeMode => {
  if (typeof window === "undefined") return "light";
  const v = localStorage.getItem(KEY);
  return v === "dark" ? "dark" : "light";
};

const apply = (m: ThemeMode) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", m === "dark");
};

export const themeStore = {
  get: read,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  set: (m: ThemeMode) => {
    if (typeof window !== "undefined") localStorage.setItem(KEY, m);
    apply(m);
    listeners.forEach((l) => l());
  },
  init: () => apply(read()),
};

export function useTheme(): ThemeMode {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.get);
}