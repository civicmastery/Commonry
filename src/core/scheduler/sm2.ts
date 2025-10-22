// src/core/scheduler/sm2.ts
import { Card } from "../models";
import { Scheduler } from "./types";

export class SM2Scheduler implements Scheduler {
  name = "sm2";

  // skipcq: JS-0105 - Method must be instance method to implement Scheduler interface
  updateCard(card: Card, rating: number): Partial<Card> {
    const now = new Date();
    let { interval, easeFactor, repetitions, lapses } = card;

    // Rating: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
    if (rating < 3) {
      // Failed review
      repetitions = 0;
      interval = 1;
      lapses += 1;

      if (rating === 1) {
        interval = Math.max(1, Math.floor(interval * 0.6));
      }
    } else {
      // Successful review
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }

      repetitions += 1;

      // Update ease factor
      easeFactor = SM2Scheduler.getNextEaseFactor(card, rating);
    }

    // Calculate next due date
    const due = new Date(now);
    due.setDate(due.getDate() + interval);

    // Update status
    let status: Card["status"] = "review";
    if (repetitions <= 1) {
      status = "learning";
    } else if (lapses > card.lapses && rating < 3) {
      status = "relearning";
    }

    return {
      interval,
      easeFactor,
      repetitions,
      lapses,
      due,
      status,
      modifiedAt: now,
    };
  }

  static getNextInterval(card: Card, rating: number): number {
    if (rating < 3) {
      return rating === 1 ? 1 : Math.max(1, Math.floor(card.interval * 0.6));
    }

    if (card.repetitions === 0) {
      return 1;
    } else if (card.repetitions === 1) {
      return 6;
    } else {
      return Math.round(card.interval * card.easeFactor);
    }
  }

  static getNextEaseFactor(card: Card, rating: number): number {
    // EF' = EF + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02))
    const ef =
      card.easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));

    // Clamp between 1.3 and 2.5
    return Math.max(1.3, Math.min(2.5, ef));
  }
}
