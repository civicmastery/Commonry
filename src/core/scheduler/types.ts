// src/core/scheduler/types.ts
import { Card } from "../models";

export interface Scheduler {
  name: string;
  updateCard(card: Card, rating: number): Partial<Card>;
  getNextInterval(card: Card, rating: number): number;
  getNextEaseFactor(card: Card, rating: number): number;
}
