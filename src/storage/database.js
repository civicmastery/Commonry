// Database layer for aesthetic SRS using IndexedDB with Dexie.js
import Dexie from 'dexie';

class Database {
  constructor() {
    this.db = new Dexie('AestheticSRS');
    
    // Define database schema
    this.db.version(1).stores({
      cards: '++id, front, back, nextReview, interval, repetitions, easeFactor, createdAt',
      reviews: '++id, cardId, rating, reviewedAt',
      decks: '++id, name, description, createdAt',
      cardDecks: '++id, cardId, deckId'
    });
  }

  async initialize() {
    try {
      await this.db.open();
      console.log('Database initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      return false;
    }
  }

  // Card operations
  async saveCard(card) {
    try {
      const cardData = {
        front: card.front,
        back: card.back,
        nextReview: card.nextReview || new Date().toISOString(),
        interval: card.interval || 1,
        repetitions: card.repetitions || 0,
        easeFactor: card.easeFactor || 2.5,
        createdAt: new Date().toISOString()
      };
      
      const id = await this.db.cards.add(cardData);
      return { ...cardData, id };
    } catch (error) {
      console.error('Error saving card:', error);
      throw error;
    }
  }

  async getNextCard() {
    try {
      const now = new Date().toISOString();
      
      // Get all cards due for review (nextReview <= now)
      const dueCards = await this.db.cards
        .where('nextReview')
        .belowOrEqual(now)
        .toArray();
      
      if (dueCards.length === 0) {
        return null; // No cards due for review
      }
      
      // Return the card with the oldest review date
      return dueCards.reduce((oldest, card) => 
        card.nextReview < oldest.nextReview ? card : oldest
      );
    } catch (error) {
      console.error('Error getting next card:', error);
      throw error;
    }
  }

  async recordReview(cardId, rating) {
    try {
      // Record the review
      await this.db.reviews.add({
        cardId: cardId,
        rating: rating,
        reviewedAt: new Date().toISOString()
      });
      
      // Update card based on SM-2 algorithm
      const card = await this.db.cards.get(cardId);
      if (!card) {
        throw new Error('Card not found');
      }
      
      // SM-2 algorithm implementation
      const { interval, repetitions, easeFactor } = this.calculateNextReview(
        card.interval,
        card.repetitions,
        card.easeFactor,
        rating
      );
      
      // Calculate next review date
      const nextReview = new Date();
      nextReview.setDate(nextReview.getDate() + interval);
      
      // Update card
      await this.db.cards.update(cardId, {
        interval,
        repetitions,
        easeFactor,
        nextReview: nextReview.toISOString()
      });
      
      return { interval, repetitions, easeFactor, nextReview };
    } catch (error) {
      console.error('Error recording review:', error);
      throw error;
    }
  }

  // SM-2 Algorithm
  calculateNextReview(interval, repetitions, easeFactor, rating) {
    // Rating: 1-5 (1 = complete fail, 5 = perfect recall)
    
    if (rating >= 3) {
      // Correct response
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions += 1;
    } else {
      // Incorrect response
      repetitions = 0;
      interval = 1;
    }
    
    // Update ease factor
    easeFactor = easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
    easeFactor = Math.max(1.3, easeFactor); // Minimum ease factor
    
    return { interval, repetitions, easeFactor };
  }

  // Additional utility methods
  async getAllCards() {
    try {
      return await this.db.cards.toArray();
    } catch (error) {
      console.error('Error getting all cards:', error);
      throw error;
    }
  }

  async getCardCount() {
    try {
      return await this.db.cards.count();
    } catch (error) {
      console.error('Error getting card count:', error);
      throw error;
    }
  }

  async getDueCardCount() {
    try {
      const now = new Date().toISOString();
      return await this.db.cards
        .where('nextReview')
        .belowOrEqual(now)
        .count();
    } catch (error) {
      console.error('Error getting due card count:', error);
      throw error;
    }
  }

  async deleteCard(cardId) {
    try {
      await this.db.cards.delete(cardId);
      // Also delete associated reviews
      await this.db.reviews.where('cardId').equals(cardId).delete();
    } catch (error) {
      console.error('Error deleting card:', error);
      throw error;
    }
  }

  async clearDatabase() {
    try {
      await this.db.cards.clear();
      await this.db.reviews.clear();
      await this.db.decks.clear();
      await this.db.cardDecks.clear();
      console.log('Database cleared');
    } catch (error) {
      console.error('Error clearing database:', error);
      throw error;
    }
  }
}

export default Database;