import { useState, useEffect } from 'react';
import { Card, Deck, SRSEngine } from '../lib/srs-engine';
import { db } from '../storage/database';

export function useSRS() {
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string>('default');

  // Load next card for review
  const loadNextCard = async (deckId: string = activeDeckId) => {
    setIsLoading(true);
    try {
      const cards = await db.getCardsForReview(deckId, 1);
      setCurrentCard(cards[0] || null);
    } catch (error) {
      console.error('Failed to load card:', error);
      setCurrentCard(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Record a review and get next card
  const reviewCard = async (cardId: string, rating: number, duration: number = 0) => {
    try {
      const result = await db.recordReview(cardId, rating, duration);
      await loadNextCard();
      return result;
    } catch (error) {
      console.error('Failed to record review:', error);
      throw error;
    }
  };

  // Load all decks
  const loadDecks = async () => {
    try {
      const allDecks = await db.getAllDecks();
      setDecks(allDecks);
    } catch (error) {
      console.error('Failed to load decks:', error);
    }
  };

  // Create a new card
  const createCard = async (front: string, back: string, deckId: string = activeDeckId) => {
    try {
      const cardId = await db.createCard(front, back, deckId);
      await db.updateDeckStats(deckId);
      await loadDecks(); // Refresh deck stats
      return cardId;
    } catch (error) {
      console.error('Failed to create card:', error);
      throw error;
    }
  };

  // Create a new deck
  const createDeck = async (name: string, description?: string) => {
    try {
      const deckId = await db.createDeck(name, description);
      await loadDecks();
      return deckId;
    } catch (error) {
      console.error('Failed to create deck:', error);
      throw error;
    }
  };

  // Initialize sample data if needed
  const initializeSampleData = async () => {
    const cardCount = await db.cards.count();
    if (cardCount === 0) {
      await db.addSampleCards();
      await loadDecks();
    }
  };

  // Get deck statistics
  const getDeckStats = async (deckId: string) => {
    try {
      const deck = await db.getDeck(deckId);
      await db.updateDeckStats(deckId);
      return await db.getDeck(deckId); // Get updated stats
    } catch (error) {
      console.error('Failed to get deck stats:', error);
      return null;
    }
  };

  // Load initial data
  useEffect(() => {
    const initialize = async () => {
      await initializeSampleData();
      await loadDecks();
      await loadNextCard();
    };
    
    initialize();
  }, []);

  return {
    // State
    currentCard,
    isLoading,
    decks,
    activeDeckId,
    
    // Actions
    loadNextCard,
    reviewCard,
    createCard,
    createDeck,
    setActiveDeckId,
    getDeckStats,
    
    // Utils
    loadDecks,
    initializeSampleData
  };
}