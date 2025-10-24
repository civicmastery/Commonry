// src/lib/srs-engine.ts
import { CardId, DeckId } from "../types/ids";
import { IdService } from "../services/id-service";

export interface Card {
  id: CardId;
  front: string;
  back: string;
  deckId: DeckId;

  // Scheduling data
  due: Date;
  interval: number; // days
  easeFactor: number; // 2.5 default
  repetitions: number;

  // Stats
  lapses: number;
  totalReviews: number;
  lastReview?: Date;

  // State
  status: "new" | "learning" | "review" | "relearning";
  queue: number;

  // Media
  frontAudio?: string; // Audio file name for front
  backAudio?: string; // Audio file name for back
  frontImage?: string; // Image file name for front
  backImage?: string; // Image file name for back

  // HTML content (for formatted Anki cards)
  frontHtml?: string; // Formatted HTML for front (if imported from Anki)
  backHtml?: string; // Formatted HTML for back (if imported from Anki)

  // Import tracking
  importSource?: string; // "anki", "commonry", etc.
  externalId?: string; // Original ID from external system
}

export interface ReviewResult {
  card: Card;
  nextReview: Date;
  interval: number;
}

export interface Deck {
  id: DeckId;
  name: string;
  description?: string;
  cardCount: number;
  dueCount: number;
  newCount: number;

  // Import tracking
  importSource?: string; // "anki", "commonry", etc.
  externalId?: string; // Original ID from external system
}

export class SRSEngine {
  // SM-2 algorithm with improvements
  private readonly INITIAL_EASE = 2.5;
  private readonly MIN_EASE = 1.3;
  private readonly EASY_BONUS = 1.3;
  private readonly INTERVAL_MODIFIER = 1.0;

  // Learning steps in minutes
  private readonly LEARNING_STEPS = [1, 10]; // 1 min, 10 min
  private readonly RELEARNING_STEPS = [10]; // 10 min

  calculateNextReview(card: Card, rating: number): ReviewResult {
    const updatedCard = { ...card };
    const now = new Date();

    // Track review
    updatedCard.totalReviews++;
    updatedCard.lastReview = now;

    if (rating === 1) {
      // Again - card was forgotten
      updatedCard.lapses++;
      updatedCard.repetitions = 0;
      updatedCard.interval = 1;
      updatedCard.status = "relearning";

      // Decrease ease factor
      updatedCard.easeFactor = Math.max(
        this.MIN_EASE,
        updatedCard.easeFactor - 0.2,
      );
    } else {
      // Card was remembered
      if (updatedCard.status === "new" || updatedCard.status === "learning") {
        // Still in learning phase
        if (rating >= 3) {
          updatedCard.status = "review";
          updatedCard.interval = rating === 4 ? 4 : 1; // Easy gets 4 day initial interval
        } else {
          updatedCard.interval = 1;
        }
      } else {
        // In review phase
        if (updatedCard.repetitions === 0) {
          updatedCard.interval = 1;
        } else if (updatedCard.repetitions === 1) {
          updatedCard.interval = 6;
        } else {
          let newInterval = updatedCard.interval * updatedCard.easeFactor;

          // Apply rating modifiers
          if (rating === 2) {
            newInterval *= 0.8; // Hard
          } else if (rating === 4) {
            newInterval *= this.EASY_BONUS; // Easy
          }

          updatedCard.interval = Math.round(
            newInterval * this.INTERVAL_MODIFIER,
          );
        }

        updatedCard.repetitions++;
      }

      // Adjust ease factor based on rating
      const easeAdjustment = [0, -0.15, 0, 0.15][rating - 1];
      updatedCard.easeFactor = Math.max(
        this.MIN_EASE,
        updatedCard.easeFactor + easeAdjustment,
      );
    }

    // Calculate next review date
    const nextReview = new Date(now);
    nextReview.setDate(nextReview.getDate() + updatedCard.interval);
    updatedCard.due = nextReview;

    return {
      card: updatedCard,
      nextReview,
      interval: updatedCard.interval,
    };
  }

  static getCardsForReview(cards: Card[], limit = 20): Card[] {
    const now = new Date();
    const nowTime = now.getTime();

    return cards
      .filter((card) => {
        // Convert due to Date if it's not already
        const dueDate =
          card.due instanceof Date ? card.due : new Date(card.due);
        return dueDate.getTime() <= nowTime;
      })
      .sort((a, b) => {
        // Prioritize new cards, then by due date
        if (a.status === "new" && b.status !== "new") return -1;
        if (b.status === "new" && a.status !== "new") return 1;

        // Convert due dates to timestamps for comparison
        const aDue =
          a.due instanceof Date ? a.due.getTime() : new Date(a.due).getTime();
        const bDue =
          b.due instanceof Date ? b.due.getTime() : new Date(b.due).getTime();
        return aDue - bDue;
      })
      .slice(0, limit);
  }

  // Create a default card
  createCard(front: string, back: string, deckId: DeckId): Card {
    return {
      id: IdService.generateCardId(),
      front,
      back,
      deckId,
      due: new Date(),
      interval: 0,
      easeFactor: this.INITIAL_EASE,
      repetitions: 0,
      lapses: 0,
      totalReviews: 0,
      status: "new",
      queue: 0,
    };
  }

  // Get time until next review in human-readable format
  static getNextReviewTime(card: Card): string {
    const now = new Date();
    // Ensure due is a Date object
    const due = card.due instanceof Date ? card.due : new Date(card.due);
    const diff = due.getTime() - now.getTime();

    if (diff <= 0) return "Now";

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
}
