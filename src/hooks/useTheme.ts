import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { Theme, applyTheme } from "../lib/theme";

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>("theme", "auto");

  useEffect(() => {
    applyTheme(theme);

    if (theme === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("auto");

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    return undefined;
  }, [theme]);

  return { theme, setTheme };
}
