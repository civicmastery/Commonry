// src/storage/database.ts
import Dexie, { Table } from "dexie";
import { Card, Deck, ReviewResult, SRSEngine } from "../lib/srs-engine";

export interface StudySession {
  id?: number;
  cardId: string;
  rating: number;
  duration: number;
  timestamp: Date;
}

export class SRSDatabase extends Dexie {
  cards!: Table<Card>;
  decks!: Table<Deck>;
  sessions!: Table<StudySession>;

  private srsEngine: SRSEngine;

  constructor() {
    super("SRSDatabase");

    this.version(1).stores({
      cards: "id, deckId, due, status, interval, easeFactor",
      decks: "id, name",
      sessions: "++id, cardId, timestamp",
    });

    this.srsEngine = new SRSEngine();
  }

  async getCardsForReview(deckId: string, limit: number = 20): Promise<Card[]> {
    const allCards = await this.cards.where("deckId").equals(deckId).toArray();
    return this.srsEngine.getCardsForReview(allCards, limit);
  }

  async recordReview(
    cardId: string,
    rating: number,
    duration: number,
  ): Promise<ReviewResult> {
    let result: ReviewResult | undefined;

    await this.transaction("rw", this.cards, this.sessions, async () => {
      const card = await this.cards.get(cardId);
      if (!card) throw new Error("Card not found");

      // Update card with SRS engine
      result = this.srsEngine.calculateNextReview(card, rating);
      await this.cards.update(cardId, result.card);

      // Record session
      await this.sessions.add({
        cardId,
        rating,
        duration,
        timestamp: new Date(),
      });
    });

    if (!result) {
      throw new Error("Failed to record review");
    }

    return result;
  }

  async createCard(
    front: string,
    back: string,
    deckId: string = "default",
    frontAudio?: string,
    backAudio?: string,
  ): Promise<string> {
    const newCard = this.srsEngine.createCard(front, back, deckId);
    if (frontAudio) newCard.frontAudio = frontAudio;
    if (backAudio) newCard.backAudio = backAudio;
    await this.cards.add(newCard);
    return newCard.id;
  }

  async createDeck(name: string, description?: string): Promise<string> {
    const newDeck: Deck = {
      id: `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      cardCount: 0,
      dueCount: 0,
      newCount: 0,
    };

    await this.decks.add(newDeck);
    return newDeck.id;
  }

  async updateDeckStats(deckId: string): Promise<void> {
    const now = new Date();
    const cards = await this.cards.where("deckId").equals(deckId).toArray();

    const cardCount = cards.length;
    const newCount = cards.filter((c) => c.status === "new").length;
    const dueCount = cards.filter((c) => c.due <= now).length;

    await this.decks.update(deckId, {
      cardCount,
      newCount,
      dueCount,
    });
  }

  // Additional utility methods
  async getAllDecks(): Promise<Deck[]> {
    return await this.decks.toArray();
  }

  async getDeck(deckId: string): Promise<Deck | undefined> {
    return await this.decks.get(deckId);
  }

  async getCard(cardId: string): Promise<Card | undefined> {
    return await this.cards.get(cardId);
  }

  async updateCard(cardId: string, updates: Partial<Card>): Promise<void> {
    await this.cards.update(cardId, updates);
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.cards.delete(cardId);
  }

  async deleteDeck(deckId: string): Promise<void> {
    // Delete all cards in the deck first
    await this.cards.where("deckId").equals(deckId).delete();
    // Then delete the deck
    await this.decks.delete(deckId);
  }

  async getNextReviewTime(cardId: string): Promise<string> {
    const card = await this.getCard(cardId);
    return card ? this.srsEngine.getNextReviewTime(card) : "Unknown";
  }

  async getReviewHistory(
    cardId: string,
    limit: number = 10,
  ): Promise<StudySession[]> {
    return await this.sessions
      .where("cardId")
      .equals(cardId)
      .reverse()
      .limit(limit)
      .toArray();
  }

  async addSampleCards(): Promise<void> {
    const sampleCards = [
      { front: "What is the capital of France?", back: "Paris" },
      { front: "What is 2 + 2?", back: "4" },
      {
        front: "What is the largest planet in our solar system?",
        back: "Jupiter",
      },
      { front: "Who painted the Mona Lisa?", back: "Leonardo da Vinci" },
      {
        front: "What is the speed of light?",
        back: "299,792,458 meters per second",
      },
    ];

    for (const card of sampleCards) {
      await this.createCard(card.front, card.back, "default");
    }

    // Create default deck if it doesn't exist
    const defaultDeck = await this.getDeck("default");
    if (!defaultDeck) {
      await this.createDeck("Default Deck", "Sample flashcards for testing");
    }

    await this.updateDeckStats("default");
  }
}

export const db = new SRSDatabase();
