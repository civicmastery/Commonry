// src/core/types.ts
// Additional type definitions for the SRS system

export interface Note {
  id: string;
  deckId: string;
  modelId: string;
  fields: Record<string, string>;
  tags: string[];
  createdAt: Date;
  modifiedAt: Date;
}

export interface CardTemplate {
  id: string;
  name: string;
  frontTemplate: string;
  backTemplate: string;
  styling: string;
}

export interface NoteType {
  id: string;
  name: string;
  fields: Field[];
  templates: CardTemplate[];
  css: string;
}

export interface Field {
  name: string;
  sticky: boolean;
  rtl: boolean;
  fontSize: number;
  font: string;
}

export interface Review {
  id: string;
  cardId: string;
  rating: Rating;
  duration: number; // milliseconds
  timestamp: Date;

  // State before review
  lastInterval: number;
  lastEaseFactor: number;

  // State after review
  newInterval: number;
  newEaseFactor: number;
}

export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export interface UserProgress {
  userId: string;
  date: Date;
  cardsStudied: number;
  timeSpent: number; // minutes
  retention: number; // percentage
  streak: number; // days
}

export interface ImportOptions {
  duplicateResolution: "skip" | "update" | "duplicate";
  deckMapping: "preserve" | "merge" | "new";
  scheduling: "preserve" | "reset";
}

export interface ExportOptions {
  includeDeckOptions: boolean;
  includeMedia: boolean;
  includeScheduling: boolean;
  format: "anki" | "json" | "csv";
}
