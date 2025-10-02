'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../lib/srs-engine';
import { 
  Brain, 
  Zap, 
  Trophy, 
  Flame,
  ChevronRight,
  RotateCw,
  Sparkles
} from 'lucide-react';

interface StudyCardProps {
  card: Card;
  onRate: (rating: number) => void;
  currentStreak: number;
  totalReviewed: number;
}

export default function StudyCard({ 
  card, 
  onRate, 
  currentStreak, 
  totalReviewed 
}: StudyCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  useEffect(() => {
    // Reset state for new card
    setIsFlipped(false);
    setShowRating(false);
    setStartTime(Date.now());
    setSelectedRating(null);
  }, [card.id]);

  const handleFlip = () => {
    if (!isFlipped) {
      setIsFlipped(true);
      setTimeout(() => setShowRating(true), 300);
    }
  };

  const handleRate = (rating: number) => {
    const timeSpent = Date.now() - startTime;
    setSelectedRating(rating);
    
    // Add a satisfying delay before moving to next card
    setTimeout(() => {
      onRate(rating);
    }, 400);
  };

  const ratingButtons = [
    { value: 1, label: 'Again', color: 'bg-red-500 hover:bg-red-600', icon: RotateCw },
    { value: 2, label: 'Hard', color: 'bg-orange-500 hover:bg-orange-600', icon: Brain },
    { value: 3, label: 'Good', color: 'bg-green-500 hover:bg-green-600', icon: ChevronRight },
    { value: 4, label: 'Easy', color: 'bg-blue-500 hover:bg-blue-600', icon: Zap },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900 p-4">
      {/* Stats Bar */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-4xl mx-auto mb-8"
      >
        <div className="flex justify-between items-center glass rounded-2xl px-6 py-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <span className="font-medium">{totalReviewed} reviewed</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Flame className={`w-5 h-5 ${currentStreak > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
            <span className="font-medium">{currentStreak} day streak</span>
          </div>
        </div>
      </motion.div>

      {/* Card Container */}
      <div className="max-w-2xl mx-auto">
        <div className="relative" style={{ perspective: '1000px' }}>
          <motion.div
            className={`card-flip ${isFlipped ? 'flipped' : ''}`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            {/* Front of card */}
            <div className="card-face absolute inset-0">
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 md:p-12 min-h-[400px] flex flex-col justify-center items-center text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="mb-6"
                >
                  <Sparkles className="w-8 h-8 text-violet-500" />
                </motion.div>
                
                <h2 className="text-2xl md:text-3xl font-semibold mb-8 leading-relaxed">
                  {card.front}
                </h2>
                
                {!isFlipped && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleFlip}
                    data-flip-button
                    className="px-8 py-4 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-2xl font-medium text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    Show Answer
                  </motion.button>
                )}
              </div>
            </div>

            {/* Back of card */}
            <div className="card-face card-back absolute inset-0">
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 md:p-12 min-h-[400px] flex flex-col justify-center items-center text-center">
                <div className="w-full">
                  <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-4">
                    Answer
                  </h3>
                  <p className="text-xl md:text-2xl font-medium mb-8 leading-relaxed">
                    {card.back}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Rating Buttons */}
          <AnimatePresence>
            {showRating && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3"
                style={{ position: 'relative', zIndex: 10 }}
              >
                {ratingButtons.map((button, index) => {
                  const Icon = button.icon;
                  return (
                    <motion.button
                      key={button.value}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRate(button.value)}
                      disabled={selectedRating !== null}
                      data-rating={button.value}
                      className={`
                        ${button.color} 
                        ${selectedRating === button.value ? 'ring-4 ring-white ring-opacity-50' : ''}
                        ${selectedRating !== null && selectedRating !== button.value ? 'opacity-50' : ''}
                        text-white rounded-2xl px-6 py-4 font-medium 
                        shadow-lg hover:shadow-xl transition-all 
                        flex items-center justify-center gap-2
                        disabled:cursor-not-allowed
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{button.label}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Keyboard shortcuts hint */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center mt-8 text-gray-500 dark:text-gray-400 text-sm"
        >
          <p>Press <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Space</kbd> to flip • 
          Use <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">1</kbd> 
          <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded mx-1">2</kbd> 
          <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded mx-1">3</kbd> 
          <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded mx-1">4</kbd> to rate
          </p>
        </motion.div>
      </div>
    </div>
  );
}