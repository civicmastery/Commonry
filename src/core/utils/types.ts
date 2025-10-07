// src/core/utils/types.ts
// Utility types for better type safety

import { Card, Deck } from "../models";

// Make certain fields optional for creation
export type CreateCardInput = Omit<
  Card,
  | "id"
  | "createdAt"
  | "modifiedAt"
  | "due"
  | "interval"
  | "easeFactor"
  | "repetitions"
  | "lapses"
  | "status"
  | "queue"
> & {
  due?: Date;
  interval?: number;
  easeFactor?: number;
  repetitions?: number;
  lapses?: number;
  status?: Card["status"];
  queue?: number;
};

export type CreateDeckInput = Omit<
  Deck,
  "id" | "createdAt" | "modifiedAt" | "newCount" | "learnCount" | "dueCount"
> & {
  newCount?: number;
  learnCount?: number;
  dueCount?: number;
};

// Update types - all fields optional except id
export type UpdateCardInput = Partial<Omit<Card, "id">> & { id: string };
export type UpdateDeckInput = Partial<Omit<Deck, "id">> & { id: string };

// Filter types for queries
export interface CardFilter {
  deckId?: string;
  status?: Card["status"];
  dueDate?: Date;
  tags?: string[];
}

export interface DeckFilter {
  parentId?: string;
  name?: string;
}

// Sort options
export type CardSortField =
  | "due"
  | "interval"
  | "easeFactor"
  | "createdAt"
  | "modifiedAt";
export type DeckSortField = "name" | "createdAt" | "modifiedAt" | "dueCount";

export interface SortOptions<T> {
  field: T;
  direction: "asc" | "desc";
}

// Pagination
export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Result types
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Event types for reactive updates
export interface SRSEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: Date;
}

export type CardEvent = SRSEvent<{
  cardId: string;
  action: "created" | "updated" | "deleted" | "reviewed";
  card?: Card;
}>;

export type DeckEvent = SRSEvent<{
  deckId: string;
  action: "created" | "updated" | "deleted";
  deck?: Deck;
}>;
