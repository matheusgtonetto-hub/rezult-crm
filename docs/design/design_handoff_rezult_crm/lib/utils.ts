// lib/utils.ts — shadcn-standard cn helper
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Theme switcher hook (data-theme on <html>)
import * as React from "react";
export type Theme = "dark" | "light";

export function useTheme(initial: Theme = "dark") {
  const [theme, setTheme] = React.useState<Theme>(initial);
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return { theme, setTheme, toggle: () => setTheme(t => (t === "dark" ? "light" : "dark")) };
}
