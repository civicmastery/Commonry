import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Card } from '../lib/srs-engine';
import { db } from '../storage/database';

interface StudyViewProps {
  onBack: () => void;
}

export function StudyView({ onBack }: StudyViewProps) {
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNextCard();
  }, []);

  const loadNextCard = async () => {
    setIsLoading(true);
    try {
      // Check if we have any cards, if not, add sample cards
      const cardCount = await db.cards.count();
      if (cardCount === 0) {
        await db.addSampleCards();
      }
      
      const cards = await db.getCardsForReview('default', 1);
      setCurrentCard(cards[0] || null);
      setIsFlipped(false);
    } catch (error) {
      console.error('Failed to load card:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRating = async (rating: number) => {
    if (!currentCard) return;
    
    try {
      const startTime = Date.now();
      const duration = Date.now() - startTime; // In a real app, track actual time
      
      const result = await db.recordReview(currentCard.id, rating, duration);
      console.log(`Card reviewed: ${rating}, next review in ${result.interval} days`);
      
      await loadNextCard();
    } catch (error) {
      console.error('Failed to record review:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="glass rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">No cards to review!</h2>
          <p className="text-muted-foreground mb-6">You're all caught up for now.</p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        
        <div className="text-foreground font-medium">
          Default Deck
        </div>
        
        <button
          onClick={loadNextCard}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw size={20} />
        </button>
      </div>

      {/* Card Area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          key={currentCard.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl"
        >
          <motion.div
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={{ duration: 0.6 }}
            className="card-flip relative h-64 mb-8"
          >
            {/* Front */}
            <div className="card-face absolute inset-0 bg-card rounded-2xl shadow-2xl p-8 flex items-center justify-center border border-border">
              <p className="text-xl text-card-foreground text-center leading-relaxed">
                {currentCard.front}
              </p>
            </div>
            
            {/* Back */}
            <div className="card-face card-back absolute inset-0 bg-card rounded-2xl shadow-2xl p-8 flex flex-col border border-border">
              <div className="text-sm text-muted-foreground mb-2">Question:</div>
              <div className="text-lg text-card-foreground mb-4">{currentCard.front}</div>
              <div className="text-sm text-muted-foreground mb-2">Answer:</div>
              <div className="text-xl text-card-foreground font-medium">{currentCard.back}</div>
            </div>
          </motion.div>

          {/* Controls */}
          <div className="flex justify-center">
            {!isFlipped ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsFlipped(true)}
                className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-lg font-medium transition-all animate-shimmer"
              >
                Show Answer
              </motion.button>
            ) : (
              <div className="flex gap-4">
                {[
                  { rating: 1, label: 'Again', color: 'bg-danger hover:bg-danger/90' },
                  { rating: 2, label: 'Hard', color: 'bg-warning hover:bg-warning/90' },
                  { rating: 3, label: 'Good', color: 'bg-success hover:bg-success/90' },
                  { rating: 4, label: 'Easy', color: 'bg-primary hover:bg-primary/90' }
                ].map(({ rating, label, color }) => (
                  <motion.button
                    key={rating}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleRating(rating)}
                    className={`px-6 py-3 ${color} text-white rounded-lg transition-all font-medium animate-slide-up`}
                    style={{ animationDelay: `${rating * 0.1}s` }}
                  >
                    {label}
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}