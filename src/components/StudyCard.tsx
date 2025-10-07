'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../lib/srs-engine';
import { getMediaUrl } from '../lib/anki-import';
import {
  Brain,
  Zap,
  Trophy,
  Flame,
  ChevronRight,
  RotateCw,
  Sparkles,
  Volume2
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
  const [frontAudioUrl, setFrontAudioUrl] = useState<string | null>(null);
  const [backAudioUrl, setBackAudioUrl] = useState<string | null>(null);

  console.log('Card front:', card.front);
  console.log('Card back:', card.back);

  // Load audio URLs when card changes
  useEffect(() => {
    const loadAudio = async () => {
      if (card.frontAudio) {
        const url = await getMediaUrl(card.frontAudio);
        setFrontAudioUrl(url);
      } else {
        setFrontAudioUrl(null);
      }

      if (card.backAudio) {
        const url = await getMediaUrl(card.backAudio);
        setBackAudioUrl(url);
      } else {
        setBackAudioUrl(null);
      }
    };
    loadAudio();
  }, [card.id, card.frontAudio, card.backAudio]);

  const playAudio = (url: string | null) => {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(e => console.error('Error playing audio:', e));
  };

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
    <div className="min-h-screen flex flex-col bg-background p-8 pt-6">
      {/* Stats Bar */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-4xl mx-auto mb-3 w-full"
      >
        <div className="top-section flex justify-between items-center border border-border rounded-lg px-6 py-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span className="font-medium text-sm">{totalReviewed} reviewed</span>
          </div>

          <div className="flex items-center gap-2">
            <Flame className={`w-4 h-4 ${currentStreak > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
            <span className="font-medium text-sm">{currentStreak} day streak</span>
          </div>
        </div>
      </motion.div>

      {/* Card Container */}
      <div className="flex-1 flex items-start justify-center pt-12">
        <div className="study-card max-w-2xl w-full">
          <AnimatePresence mode="wait">
            {!isFlipped ? (
              <motion.div
                key="front"
                initial={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-card border-2 border-border rounded-lg p-8 md:p-12 min-h-[320px] flex flex-col justify-center items-center text-center relative">
                  {frontAudioUrl && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => playAudio(frontAudioUrl)}
                      className="absolute top-4 right-4 p-2 hover:bg-muted rounded transition-colors"
                      title="Play audio"
                    >
                      <Volume2 className="w-5 h-5 text-primary" />
                    </motion.button>
                  )}

                  <h2 className="text-2xl md:text-3xl font-medium mb-8 leading-tight">
                    {card.front}
                  </h2>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleFlip}
                    data-flip-button
                    className="px-8 py-3 bg-primary text-primary-foreground rounded font-medium transition-all"
                  >
                    Show Answer
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="back"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-card border-2 border-border rounded-lg p-8 md:p-12 min-h-[320px] flex flex-col justify-center items-center text-center relative">
                  {backAudioUrl && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => playAudio(backAudioUrl)}
                      className="absolute top-4 right-4 p-2 hover:bg-muted rounded transition-colors"
                      title="Play audio"
                    >
                      <Volume2 className="w-5 h-5 text-primary" />
                    </motion.button>
                  )}

                  <div className="w-full">
                    <h3 className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">
                      Answer
                    </h3>
                    <div className="text-xl md:text-2xl font-medium leading-relaxed whitespace-pre-line">
                      {card.back}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Rating Buttons */}
      <AnimatePresence>
        {showRating && isFlipped && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pb-40"
          >
            <p className="text-center text-muted-foreground mb-8 font-medium">
              How strongly did you remember the answer?
            </p>
            <div className="flex gap-4 justify-center max-w-3xl mx-auto">
              {ratingButtons.map((btn) => {
                const Icon = btn.icon;
                const isSelected = selectedRating === btn.value;
                return (
                  <motion.button
                    key={btn.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleRate(btn.value)}
                    data-rating={btn.value}
                    disabled={selectedRating !== null}
                    className={`flex flex-col items-center gap-3 px-8 py-4 rounded border-2 font-medium transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border hover:border-foreground'
                    } ${selectedRating !== null && !isSelected ? 'opacity-30' : ''}`}
                  >
                    <Icon className="w-5 h-5" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-2xl font-medium">{btn.value}</span>
                      <span className="text-xs uppercase tracking-wide">{btn.label}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}