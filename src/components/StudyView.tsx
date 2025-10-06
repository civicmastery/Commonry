import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  Loader2,
  Plus,
  Library,
  BarChart3,
  Settings,
  Sparkles
} from 'lucide-react';
import { Card, Deck } from '../lib/srs-engine';
import { db } from '../storage/database';
import StudyCard from './StudyCard';

interface StudyViewProps {
  onBack: () => void;
  initialDeckId?: string;
}

export function StudyView({ onBack, initialDeckId }: StudyViewProps) {
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [dueCards, setDueCards] = useState<Card[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>('default');
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDeckSelector, setShowDeckSelector] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    correct: 0,
    streak: 0
  });

  useEffect(() => {
    loadDecks();
    loadCards();
    loadStats();
  }, []);

  useEffect(() => {
    if (selectedDeck) {
      loadCards();
    }
  }, [selectedDeck]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && currentCard) {
        e.preventDefault();
        const flipButton = document.querySelector('[data-flip-button]');
        if (flipButton) (flipButton as HTMLElement).click();
      }
      
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const rating = parseInt(e.code.replace('Digit', ''));
        const ratingButton = document.querySelector(`[data-rating="${rating}"]`);
        if (ratingButton) (ratingButton as HTMLElement).click();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentCard]);

  const loadStats = () => {
    // Load saved stats from localStorage
    const savedStats = localStorage.getItem('srs-stats');
    if (savedStats) {
      setSessionStats(JSON.parse(savedStats));
    }
  };

  const loadDecks = async () => {
    try {
      const allDecks = await db.getAllDecks();
      setDecks(allDecks);

      // Use initialDeckId if provided, otherwise use first deck
      if (initialDeckId) {
        setSelectedDeck(initialDeckId);
      } else if (allDecks.length > 0 && !selectedDeck) {
        setSelectedDeck(allDecks[0].id);
      }
    } catch (error) {
      console.error('Failed to load decks:', error);
    }
  };

  const loadCards = async () => {
    setIsLoading(true);
    try {
      // Check if we have any cards, if not, add sample cards
      const cardCount = await db.cards.count();
      if (cardCount === 0) {
        await db.addSampleCards();
      }

      // Get all cards and cards for review from selected deck
      const allCardsArray = await db.cards.where('deckId').equals(selectedDeck).toArray();
      const cardsForReview = await db.getCardsForReview(selectedDeck, 20);

      setAllCards(allCardsArray);
      setDueCards(cardsForReview);
      setCurrentCard(cardsForReview[0] || null);
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRating = useCallback(async (rating: number) => {
    if (!currentCard) return;
    
    try {
      const startTime = Date.now();
      const duration = Date.now() - startTime;
      
      // Record review in database
      const result = await db.recordReview(currentCard.id, rating, duration);
      console.log(`Card reviewed: ${rating}, next review in ${result.interval} days`);
      
      // Update session stats
      const newStats = {
        reviewed: sessionStats.reviewed + 1,
        correct: sessionStats.correct + (rating >= 3 ? 1 : 0),
        streak: rating >= 3 ? sessionStats.streak + 1 : 0
      };
      setSessionStats(newStats);
      localStorage.setItem('srs-stats', JSON.stringify(newStats));

      // Show success animation for good/easy ratings
      if (rating >= 3) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1500);
      }

      // Move to next card
      const remainingDue = dueCards.slice(1);
      setDueCards(remainingDue);
      
      if (remainingDue.length > 0) {
        setTimeout(() => {
          setCurrentCard(remainingDue[0]);
        }, 500);
      } else {
        // Session complete!
        setTimeout(() => {
          setCurrentCard(null);
        }, 500);
      }
    } catch (error) {
      console.error('Failed to record review:', error);
    }
  }, [currentCard, dueCards, sessionStats]);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    
    // TODO: Implement actual Anki import
    // For now, we'll simulate it
    setTimeout(() => {
      setIsLoading(false);
      setShowImport(false);
      // Reload cards after import
      loadCards();
    }, 2000);
  };

  if (isLoading && sessionStats.reviewed === 0) {
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
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="mb-8 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors glass rounded-lg px-4 py-2"
          >
            <ArrowLeft size={20} />
            Back
          </button>

          {/* Header */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-12"
          >
            <h1 className="text-5xl font-bold gradient-text mb-4">AestheticSRS</h1>
            <p className="text-gray-600 dark:text-gray-400">Beautiful spaced repetition learning</p>

            {/* Deck Selector */}
            {decks.length > 0 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <label className="text-gray-600 dark:text-gray-400">Studying:</label>
                <select
                  value={selectedDeck}
                  onChange={(e) => setSelectedDeck(e.target.value)}
                  className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name} ({deck.dueCount} due)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </motion.div>

          {/* Session Complete or No Cards */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-12 text-center"
          >
            {sessionStats.reviewed > 0 ? (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                >
                  <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
                </motion.div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Session Complete! 🎉</h2>
                <div className="space-y-3 mb-8">
                  <p className="text-xl text-gray-600 dark:text-gray-300">
                    You reviewed <span className="font-bold text-violet-600 dark:text-violet-400">{sessionStats.reviewed}</span> cards
                  </p>
                  <p className="text-lg text-gray-500 dark:text-gray-400">
                    Accuracy: {Math.round((sessionStats.correct / sessionStats.reviewed) * 100)}%
                  </p>
                </div>
              </>
            ) : (
              <>
                <Sparkles className="w-20 h-20 text-violet-500 mx-auto mb-6" />
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">No cards due!</h2>
                <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                  Great job keeping up with your reviews!
                </p>
              </>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setShowImport(true)}
                className="px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-2xl font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-all"
              >
                <Upload className="w-5 h-5" />
                Import Deck
              </button>
              
              <button
                onClick={() => onBack()}
                className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-2xl font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-all"
              >
                <Plus className="w-5 h-5" />
                Browse Decks
              </button>
            </div>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8"
          >
            <div className="glass rounded-2xl p-6 text-center">
              <Library className="w-8 h-8 text-violet-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{allCards.length}</p>
              <p className="text-gray-600 dark:text-gray-400">Total Cards</p>
            </div>

            <div className="glass rounded-2xl p-6 text-center">
              <BarChart3 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{sessionStats.streak}</p>
              <p className="text-gray-600 dark:text-gray-400">Current Streak</p>
            </div>

            <div className="glass rounded-2xl p-6 text-center">
              <Settings className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">20</p>
              <p className="text-gray-600 dark:text-gray-400">Daily Goal</p>
            </div>
          </motion.div>
        </div>

        {/* Import Modal */}
        <AnimatePresence>
          {showImport && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
              onClick={() => setShowImport(false)}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Import Anki Deck</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Select an .apkg file to import your Anki deck
                </p>
                
                <label className="block">
                  <input
                    type="file"
                    accept=".apkg"
                    onChange={handleFileImport}
                    className="hidden"
                    disabled={isLoading}
                  />
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-500 transition-colors">
                    {isLoading ? (
                      <Loader2 className="w-12 h-12 text-violet-500 mx-auto animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    )}
                    <p className="text-gray-600 dark:text-gray-300">
                      {isLoading ? 'Importing...' : 'Click to select file'}
                    </p>
                  </div>
                </label>

                <button
                  onClick={() => setShowImport(false)}
                  className="w-full mt-6 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-2xl font-medium hover:shadow-lg transition-all"
                  disabled={isLoading}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {currentCard && (
          <div className="relative min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900">
            {/* Header with Back Button and Deck Selector */}
            <div className="flex items-center justify-between p-4 max-w-6xl mx-auto">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors glass rounded-lg px-4 py-2"
              >
                <ArrowLeft size={20} />
                Back
              </button>

              {/* Deck Selector */}
              {decks.length > 0 && (
                <div className="flex items-center gap-3">
                  <label className="text-gray-600 dark:text-gray-400 text-sm">Deck:</label>
                  <select
                    value={selectedDeck}
                    onChange={(e) => setSelectedDeck(e.target.value)}
                    className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name} ({deck.dueCount} due)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Study Card Component */}
            <StudyCard
              key={currentCard.id}
              card={currentCard}
              onRate={handleRating}
              currentStreak={sessionStats.streak}
              totalReviewed={sessionStats.reviewed}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Success Animation Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
          >
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle className="w-32 h-32 text-green-500" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress indicator */}
      {currentCard && dueCards.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-30">
          <div className="glass rounded-full px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-medium">
              {dueCards.length} cards remaining
            </span>
            <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                initial={{ width: 0 }}
                animate={{ 
                  width: `${((sessionStats.reviewed) / (sessionStats.reviewed + dueCards.length)) * 100}%` 
                }}
                transition={{ type: 'spring', stiffness: 100 }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}