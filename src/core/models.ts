// src/core/models.ts
export interface Card {
  id: string;
  noteId: string;
  deckId: string;
  front: string;
  back: string;

  // Scheduling data
  due: Date;
  interval: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;

  // State
  status: "new" | "learning" | "review" | "relearning";
  queue: number;

  createdAt: Date;
  modifiedAt: Date;
}

export interface Deck {
  id: string;
  name: string;
  parentId?: string;

  // Settings
  newCardsPerDay: number;
  reviewsPerDay: number;

  // Stats cached for performance
  newCount: number;
  learnCount: number;
  dueCount: number;

  createdAt: Date;
  modifiedAt: Date;
}

export interface StudySession {
  cardId: string;
  rating: number;
  duration: number;
  timestamp: Date;
}

export interface DeckConfig {
  algorithm: "sm2" | "fsrs" | "sm18"; // Changed from 'anki21' to 'sm18'
  learningSteps: number[]; // in minutes [1, 10]
  relearnSteps: number[]; // in minutes [10]
  graduatingInterval: number; // days
  easyInterval: number; // days
  startingEase: number; // 2.5 = 250%
  easyBonus: number; // 1.3 = 130%
  intervalModifier: number; // 1.0 = 100%
  maximumInterval: number; // days
  leechThreshold: number; // number of lapses
}
