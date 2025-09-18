// src/core/scheduler.ts
interface Card {
  id: string;
  interval: number; // days
  easeFactor: number; // 1.3 to 2.5
  repetitions: number;
  nextReview: Date;
}

class SpacedRepetitionScheduler {
  // Implement SM-2 algorithm
  calculateNextReview(card: Card, quality: number): Card {
    // 0-5 quality, where <3 means forgot
    // This is your core business logic
  }
}