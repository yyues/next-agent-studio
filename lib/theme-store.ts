import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

interface ThemeStore {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeClass(theme: Theme) {
  if (typeof window === "undefined") return;
  const isDark =
    theme === "dark" || (theme === "system" && getSystemTheme() === "dark");
  document.documentElement.classList.toggle("dark", isDark);
}

function loadInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export const useThemeStore = create<ThemeStore>((set) => {
  const initial = loadInitialTheme();
  if (typeof window !== "undefined") {
    requestAnimationFrame(() => applyThemeClass(initial));
  }

  return {
    theme: initial,
    resolved: initial === "system" ? getSystemTheme() : initial,
    setTheme: (theme) => {
      localStorage.setItem("theme", theme);
      applyThemeClass(theme);
      const resolved = theme === "system" ? getSystemTheme() : theme;
      set({ theme, resolved });
    },
  };
});

if (typeof window !== "undefined") {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", () => {
    const store = useThemeStore.getState();
    if (store.theme === "system") {
      applyThemeClass("system");
      useThemeStore.setState({ resolved: getSystemTheme() });
    }
  });
}
