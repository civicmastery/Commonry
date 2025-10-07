// App constants
export const APP_NAME = "Commonry App";
export const APP_VERSION = "1.0.0";

// Storage keys
export const STORAGE_KEYS = {
  THEME: "commonry-theme",
  ACTIVE_DECK: "commonry-active-deck",
  SETTINGS: "commonry-settings",
  STATS: "commonry-stats",
} as const;

// Default settings
export const DEFAULT_SETTINGS = {
  cardsPerDay: 20,
  reviewsPerDay: 200,
  showIntervals: true,
  enableShortcuts: true,
  enableAnimations: true,
  soundEffects: false,
  hapticFeedback: true,
} as const;

// Keyboard shortcuts
export const SHORTCUTS = {
  SHOW_ANSWER: " ",
  RATE_AGAIN: "1",
  RATE_HARD: "2",
  RATE_GOOD: "3",
  RATE_EASY: "4",
  UNDO: "z",
  DECK_BROWSER: "d",
  STATS: "s",
  SETTINGS: ",",
} as const;

// Animation durations (ms)
export const ANIMATION = {
  CARD_FLIP: 600,
  FADE_IN: 300,
  SLIDE_UP: 200,
  BUTTON_PRESS: 100,
} as const;
