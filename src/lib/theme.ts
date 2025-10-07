export type Theme = "light" | "dark" | "auto";

export const themes = {
  light: {
    primary: "#667eea",
    secondary: "#764ba2",
    background: "#ffffff",
    surface: "#f7fafc",
    text: "#1a202c",
    textSecondary: "#718096",
    border: "#e2e8f0",
    success: "#48bb78",
    warning: "#ed8936",
    error: "#f56565",
    info: "#4299e1",
  },
  dark: {
    primary: "#818cf8",
    secondary: "#a78bfa",
    background: "#1a202c",
    surface: "#2d3748",
    text: "#f7fafc",
    textSecondary: "#cbd5e0",
    border: "#4a5568",
    success: "#68d391",
    warning: "#f6ad55",
    error: "#fc8181",
    info: "#63b3ed",
  },
} as const;

export function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const effectiveTheme = theme === "auto" ? getSystemTheme() : theme;
  const colors = themes[effectiveTheme];

  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });

  root.setAttribute("data-theme", effectiveTheme);
}
