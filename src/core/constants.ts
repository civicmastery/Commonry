// src/core/constants.ts
// Default values and constants for the SRS system

import { DeckConfig } from "./models";

export const ALGORITHMS = {
  SM2: "sm2",
  FSRS: "fsrs",
  SM18: "sm18",
} as const;

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  algorithm: "sm2",
  learningSteps: [1, 10], // 1 minute, 10 minutes
  relearnSteps: [10], // 10 minutes
  graduatingInterval: 1, // 1 day
  easyInterval: 4, // 4 days
  startingEase: 2.5, // 250%
  easyBonus: 1.3, // 130%
  intervalModifier: 1.0, // 100%
  maximumInterval: 36500, // 100 years
  leechThreshold: 8, // 8 lapses
};

export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const DEFAULT_REVIEWS_PER_DAY = 200;

export const QUEUE_TYPES = {
  NEW: 0,
  LEARNING: 1,
  REVIEW: 2,
  DAY_LEARNING: 3,
  PREVIEW: 4,
} as const;

export const CARD_STATES = {
  NEW: "new",
  LEARNING: "learning",
  REVIEW: "review",
  RELEARNING: "relearning",
} as const;

export const MINIMUM_INTERVAL = 1; // 1 day
export const MAXIMUM_INTERVAL = 36500; // 100 years
export const MINIMUM_EASE_FACTOR = 1.3; // 130%
export const MAXIMUM_EASE_FACTOR = 2.5; // 250%

export const RATING_BUTTONS = {
  AGAIN: { value: 1, label: "Again", color: "#ef4444" },
  HARD: { value: 2, label: "Hard", color: "#f97316" },
  GOOD: { value: 3, label: "Good", color: "#22c55e" },
  EASY: { value: 4, label: "Easy", color: "#06b6d4" },
} as const;
