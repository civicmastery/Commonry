"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "../lib/srs-engine";
import { getMediaUrl } from "../lib/anki-import";
import { SafeHtml } from "./SafeHtml";
import { Volume2, Clock, BarChart3 } from "lucide-react";

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
  totalReviewed,
}: StudyCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [frontAudioUrl, setFrontAudioUrl] = useState<string | null>(null);
  const [backAudioUrl, setBackAudioUrl] = useState<string | null>(null);
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null);
  const [backImageUrl, setBackImageUrl] = useState<string | null>(null);

  // Load media URLs when card changes
  useEffect(() => {
    const loadMedia = async () => {
      // Load audio
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

      // Load images
      if (card.frontImage) {
        const url = await getMediaUrl(card.frontImage);
        setFrontImageUrl(url);
      } else {
        setFrontImageUrl(null);
      }

      if (card.backImage) {
        const url = await getMediaUrl(card.backImage);
        setBackImageUrl(url);
      } else {
        setBackImageUrl(null);
      }
    };
    loadMedia();
  }, [
    card.id,
    card.frontAudio,
    card.backAudio,
    card.frontImage,
    card.backImage,
  ]);

  const playAudio = (url: string | null) => {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch((e) => console.error("Error playing audio:", e));
  };

  const handleFrontAudioClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      playAudio(frontAudioUrl);
    },
    [frontAudioUrl],
  );

  const handleBackAudioClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      playAudio(backAudioUrl);
    },
    [backAudioUrl],
  );

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
    setSelectedRating(rating);

    // Add a satisfying delay before moving to next card
    setTimeout(() => {
      onRate(rating);
    }, 400);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleFlip();
    }
  }, []);

  const handleRateClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rating = e.currentTarget.dataset.rating;
      if (rating) {
        handleRate(parseInt(rating));
      }
    },
    [],
  );

  const ratingButtons = [
    {
      value: 1,
      label: "Again",
      interval: "1 day",
      bgColor: "bg-red-100",
      hoverColor: "hover:bg-red-200",
      textColor: "text-red-700",
      borderColor: "border-red-300",
    },
    {
      value: 2,
      label: "Hard",
      interval: "3 days",
      bgColor: "bg-orange-100",
      hoverColor: "hover:bg-orange-200",
      textColor: "text-orange-700",
      borderColor: "border-orange-300",
    },
    {
      value: 3,
      label: "Good",
      interval: "10 days",
      bgColor: "bg-blue-100",
      hoverColor: "hover:bg-blue-200",
      textColor: "text-blue-700",
      borderColor: "border-blue-300",
    },
    {
      value: 4,
      label: "Easy",
      interval: "20 days",
      bgColor: "bg-green-100",
      hoverColor: "hover:bg-green-200",
      textColor: "text-green-700",
      borderColor: "border-green-300",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-300px)]">
      {/* Card Container - Simple Reveal */}
      <div className="w-full max-w-2xl space-y-6">
        {/* Question Card */}
        <div
          onClick={!isFlipped ? handleFlip : undefined}
          onKeyDown={!isFlipped ? handleKeyDown : undefined}
          tabIndex={!isFlipped ? 0 : -1}
          role={!isFlipped ? "button" : undefined}
          aria-label={!isFlipped ? "Click to reveal answer" : undefined}
          className={`${!isFlipped ? "cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600" : ""} bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center border-2 border-gray-200 dark:border-gray-700 transition-colors min-h-[200px]`}
        >
          {frontAudioUrl && (
            <button
              onClick={handleFrontAudioClick}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="Play audio"
            >
              <Volume2 className="w-5 h-5 text-indigo-600" />
            </button>
          )}

          <div className="text-center w-full">
            <span className="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-full mb-4">
              Question
            </span>
            {frontImageUrl && (
              <div className="mb-4">
                <img
                  src={frontImageUrl}
                  alt="Front card"
                  className="max-w-full max-h-48 mx-auto rounded-lg shadow-md"
                />
              </div>
            )}
            {card.frontHtml ? (
              <SafeHtml
                html={card.frontHtml}
                className="text-lg text-gray-900 dark:text-white mb-4 anki-card-content"
              />
            ) : (
              <h3 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 whitespace-pre-line">
                {card.front}
              </h3>
            )}
            {!isFlipped && (
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Click to reveal answer
              </p>
            )}
          </div>
        </div>

        {/* Answer Card - Revealed Below */}
        <AnimatePresence>
          {isFlipped && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center border-2 border-green-300 dark:border-green-700 min-h-[200px] relative"
            >
              {backAudioUrl && (
                <button
                  onClick={handleBackAudioClick}
                  className="absolute top-4 right-4 p-2 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-colors"
                  title="Play audio"
                >
                  <Volume2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </button>
              )}

              <div className="text-center w-full">
                <span className="inline-block px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-semibold rounded-full mb-4">
                  Answer
                </span>
                {backImageUrl && (
                  <div className="mb-4">
                    <img
                      src={backImageUrl}
                      alt="Back card"
                      className="max-w-full max-h-48 mx-auto rounded-lg shadow-md"
                    />
                  </div>
                )}
                {card.backHtml ? (
                  <SafeHtml
                    html={card.backHtml}
                    className="text-lg text-green-900 dark:text-green-100 mb-4 anki-card-content"
                  />
                ) : (
                  <h3 className="text-3xl md:text-4xl font-bold text-green-900 dark:text-green-100 mb-4 whitespace-pre-line">
                    {card.back}
                  </h3>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Response Options */}
      <div className="w-full max-w-2xl mt-6">
        <AnimatePresence>
          {isFlipped && showRating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3"
            >
              {ratingButtons.map((btn) => {
                const isSelected = selectedRating === btn.value;
                return (
                  <button
                    key={btn.value}
                    onClick={handleRateClick}
                    data-rating={btn.value}
                    disabled={selectedRating !== null}
                    className={`py-3 px-4 ${btn.bgColor} ${btn.hoverColor} ${btn.textColor} font-semibold rounded-lg transition-all border ${btn.borderColor} hover:shadow-lg ${
                      selectedRating !== null && !isSelected ? "opacity-30" : ""
                    }`}
                  >
                    <div className="text-sm">{btn.label}</div>
                    <div className="text-xs opacity-75">{btn.interval}</div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Study Stats */}
      <div className="w-full max-w-2xl mt-12 grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-2 flex items-center gap-2">
            <Clock size={16} className="text-orange-500" />
            Time
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {Math.floor((Date.now() - startTime) / 1000 / 60)}m{" "}
            {Math.floor(((Date.now() - startTime) / 1000) % 60)}s
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-2 flex items-center gap-2">
            <BarChart3 size={16} className="text-purple-500" />
            Streak
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {currentStreak} days
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-2 flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-500" />
            Reviewed
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalReviewed}
          </div>
        </div>
      </div>
    </div>
  );
}
