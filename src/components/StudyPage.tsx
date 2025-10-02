import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StudyCard from './StudyCard';
import { SRSEngine, Card, Deck } from '../lib/srs-engine';
import { 
  Upload, 
  CheckCircle, 
  XCircle,
  Loader2,
  Plus,
  Library,
  BarChart3,
  Settings,
  Sparkles,
  ArrowLeft
} from 'lucide-react';

interface StudyPageProps {
  onBack?: () => void;
}

export default function StudyPage({ onBack }: StudyPageProps = {}) {
  const [srsEngine] = useState(() => new SRSEngine());
  const [cards, setCards] = useState<Card[]>([]);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [dueCards, setDueCards] = useState<Card[]>([]);
  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    correct: 0,
    streak: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Initialize with sample cards for demo
  useEffect(() => {
    const sampleCards = [
      srsEngine.createCard(
        "What is the capital of France?",
        "Paris",
        "geography"
      ),
      srsEngine.createCard(
        "What is 2 + 2?",
        "4",
        "math"
      ),
      srsEngine.createCard(
        "What is the speed of light?",
        "299,792,458 meters per second",
        "physics"
      ),
      srsEngine.createCard(
        "Who painted the Mona Lisa?",
        "Leonardo da Vinci",
        "art"
      ),
      srsEngine.createCard(
        "What year did World War II end?",
        "1945",
        "history"
      )
    ];
    
    setCards(sampleCards);
    const due = srsEngine.getCardsForReview(sampleCards, 20);
    setDueCards(due);
    setCurrentCard(due[0] || null);
    
    // Load saved stats
    const savedStats = localStorage.getItem('srs-stats');
    if (savedStats) {
      setSessionStats(JSON.parse(savedStats));
    }
  }, [srsEngine]);

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

  const handleRate = useCallback((rating: number) => {
    if (!currentCard) return;

    // Update card with new scheduling
    const result = srsEngine.calculateNextReview(currentCard, rating);
    
    // Update cards array
    setCards(prev => 
      prev.map(c => c.id === currentCard.id ? result.card : c)
    );

    // Update stats
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
  }, [currentCard, dueCards, srsEngine, sessionStats]);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    
    // Here you would implement the actual Anki import
    // For now, we'll simulate it
    setTimeout(() => {
      setIsLoading(false);
      setShowImport(false);
      // Add imported cards logic here
    }, 2000);
  };

  if (!currentCard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          {onBack && (
            <button
              onClick={onBack}
              className="mb-8 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors glass rounded-lg px-4 py-2"
            >
              <ArrowLeft size={20} />
              Back
            </button>
          )}

          {/* Header */}
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-12 pt-8"
          >
            <h1 className="text-5xl font-bold gradient-text mb-4">SRS Lite</h1>
            <p className="text-gray-600 dark:text-gray-400">Beautiful spaced repetition learning</p>
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
                <h2 className="text-3xl font-bold mb-4">Session Complete! 🎉</h2>
                <div className="space-y-3 mb-8">
                  <p className="text-xl text-gray-600 dark:text-gray-400">
                    You reviewed <span className="font-bold text-violet-600">{sessionStats.reviewed}</span> cards
                  </p>
                  <p className="text-lg text-gray-500 dark:text-gray-500">
                    Accuracy: {Math.round((sessionStats.correct / sessionStats.reviewed) * 100)}%
                  </p>
                </div>
              </>
            ) : (
              <>
                <Sparkles className="w-20 h-20 text-violet-500 mx-auto mb-6" />
                <h2 className="text-3xl font-bold mb-4">No cards due!</h2>
                <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
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
                className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-2xl font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-all"
              >
                <Plus className="w-5 h-5" />
                Create Cards
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
              <p className="text-2xl font-bold">{cards.length}</p>
              <p className="text-gray-600 dark:text-gray-400">Total Cards</p>
            </div>
            
            <div className="glass rounded-2xl p-6 text-center">
              <BarChart3 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{sessionStats.streak}</p>
              <p className="text-gray-600 dark:text-gray-400">Day Streak</p>
            </div>
            
            <div className="glass rounded-2xl p-6 text-center">
              <Settings className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">20</p>
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
                <h3 className="text-2xl font-bold mb-4">Import Anki Deck</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
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
                    <p className="text-gray-600 dark:text-gray-400">
                      {isLoading ? 'Importing...' : 'Click to select file'}
                    </p>
                  </div>
                </label>

                <button
                  onClick={() => setShowImport(false)}
                  className="w-full mt-6 px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-2xl font-medium hover:shadow-lg transition-all"
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
      <AnimatePresence>
        {currentCard && (
          <div className="relative">
            {/* Back Button - Positioned absolutely */}
            {onBack && (
              <button
                onClick={onBack}
                className="absolute top-4 left-4 z-20 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors glass rounded-lg px-4 py-2"
              >
                <ArrowLeft size={20} />
                Back
              </button>
            )}

            <StudyCard
              key={currentCard.id}
              card={currentCard}
              onRate={handleRate}
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
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
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
    </>
  );
}