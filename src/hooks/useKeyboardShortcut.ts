import { useEffect, useCallback } from "react";

type KeyboardShortcut = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: () => void;
};

export function useKeyboardShortcut(shortcuts: KeyboardShortcut[]) {
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      shortcuts.forEach((shortcut) => {
        const matchesKey =
          event.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesCtrl = shortcut.ctrl
          ? event.ctrlKey || event.metaKey
          : true;
        const matchesShift = shortcut.shift ? event.shiftKey : true;
        const matchesAlt = shortcut.alt ? event.altKey : true;

        if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
          event.preventDefault();
          shortcut.callback();
        }
      });
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);
}
