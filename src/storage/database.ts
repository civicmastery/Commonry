// src/storage/database.ts
import Dexie, { Table } from "dexie";
import { Card, Deck, ReviewResult, SRSEngine } from "../lib/srs-engine";
import { CardId, DeckId, ReviewId } from "../types/ids";
import { IdService } from "../services/id-service";

export interface StudySession {
  id?: ReviewId;
  cardId: CardId;
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

  async getCardsForReview(deckId: DeckId, limit = 20): Promise<Card[]> {
    const allCards = await this.cards.where("deckId").equals(deckId).toArray();
    return this.srsEngine.getCardsForReview(allCards, limit);
  }

  async recordReview(
    cardId: CardId,
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
    deckId: DeckId,
    frontAudio?: string,
    backAudio?: string,
    frontImage?: string,
    backImage?: string,
  ): Promise<CardId> {
    const newCard = this.srsEngine.createCard(front, back, deckId);
    if (frontAudio) newCard.frontAudio = frontAudio;
    if (backAudio) newCard.backAudio = backAudio;
    if (frontImage) newCard.frontImage = frontImage;
    if (backImage) newCard.backImage = backImage;
    await this.cards.add(newCard);
    return newCard.id;
  }

  async createDeck(name: string, description?: string): Promise<DeckId> {
    const newDeck: Deck = {
      id: IdService.generateDeckId(),
      name,
      description,
      cardCount: 0,
      dueCount: 0,
      newCount: 0,
    };

    await this.decks.add(newDeck);
    return newDeck.id;
  }

  async updateDeckStats(deckId: DeckId): Promise<void> {
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

  async getDeck(deckId: DeckId): Promise<Deck | undefined> {
    return await this.decks.get(deckId);
  }

  async getCard(cardId: CardId): Promise<Card | undefined> {
    return await this.cards.get(cardId);
  }

  async updateCard(cardId: CardId, updates: Partial<Card>): Promise<void> {
    await this.cards.update(cardId, updates);
  }

  async deleteCard(cardId: CardId): Promise<void> {
    await this.cards.delete(cardId);
  }

  async deleteDeck(deckId: DeckId): Promise<void> {
    // Delete all cards in the deck first
    await this.cards.where("deckId").equals(deckId).delete();
    // Then delete the deck
    await this.decks.delete(deckId);
  }

  async getNextReviewTime(cardId: CardId): Promise<string> {
    const card = await this.getCard(cardId);
    return card ? this.srsEngine.getNextReviewTime(card) : "Unknown";
  }

  async getReviewHistory(cardId: CardId, limit = 10): Promise<StudySession[]> {
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

    // Create or get default deck
    const existingDecks = await this.getAllDecks();
    let defaultDeckId: DeckId;

    if (existingDecks.length === 0) {
      defaultDeckId = await this.createDeck(
        "Default Deck",
        "Sample flashcards for testing",
      );
    } else {
      defaultDeckId = existingDecks[0].id;
    }

    // Add sample cards to the deck
    for (const card of sampleCards) {
      await this.createCard(card.front, card.back, defaultDeckId);
    }

    await this.updateDeckStats(defaultDeckId);
  }
}

export const db = new SRSDatabase();
