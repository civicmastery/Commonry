import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Settings, BarChart3, Moon, Sun } from 'lucide-react';
import { StudyView } from './components/StudyView';
import { DeckBrowser } from './components/DeckBrowser';
import { StatsView } from './components/StatsView';
import { db } from './storage/database';
import { useTheme } from './contexts/ThemeContext';

type View = 'home' | 'study' | 'browse' | 'stats';

function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedDeckId, setSelectedDeckId] = useState<string | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await db.open();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };

    initializeApp();
  }, []);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-white border-t-transparent rounded-full"
        />
        <span className="ml-3 text-white text-lg">Initializing...</span>
      </div>
    );
  }

  const handleStartStudy = (deckId?: string) => {
    setSelectedDeckId(deckId);
    setCurrentView('study');
  };

  const renderView = () => {
    switch (currentView) {
      case 'study':
        return <StudyView onBack={() => setCurrentView('home')} initialDeckId={selectedDeckId} />;
      case 'browse':
        return <DeckBrowser onBack={() => setCurrentView('home')} onStartStudy={handleStartStudy} />;
      case 'stats':
        return <StatsView onBack={() => setCurrentView('home')} />;
      default:
        return <HomeView onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 p-3 rounded-full bg-white/10 dark:bg-white/10 backdrop-blur-lg border border-white/20 hover:bg-white/20 transition-colors"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <Sun className="w-5 h-5 text-yellow-400" />
        ) : (
          <Moon className="w-5 h-5 text-gray-700" />
        )}
      </button>

      {renderView()}
    </div>
  );
}

interface HomeViewProps {
  onNavigate: (view: View) => void;
}

function HomeView({ onNavigate }: HomeViewProps) {
  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-gradient-to-br from-primary/20 to-secondary/20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-8 shadow-2xl max-w-md w-full animate-float"
      >
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold text-foreground text-center mb-2 gradient-text"
        >
          AestheticSRS
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground text-center mb-8"
        >
          Beautiful spaced repetition learning
        </motion.p>

        <div className="space-y-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('study')}
            className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-primary/90 text-primary-foreground py-4 px-6 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Play size={20} />
            Start Studying
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('browse')}
            className="w-full flex items-center justify-center gap-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground py-4 px-6 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            <Settings size={20} />
            Browse Decks
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('stats')}
            className="w-full flex items-center justify-center gap-3 bg-muted hover:bg-muted/80 text-muted-foreground py-4 px-6 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted focus-visible:ring-offset-2"
          >
            <BarChart3 size={20} />
            Statistics
          </motion.button>

        </div>
      </motion.div>
    </div>
  );
}

export default App;