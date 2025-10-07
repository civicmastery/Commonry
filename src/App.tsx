import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Settings, BarChart3, Moon, Sun } from 'lucide-react';
import { StudyView } from './components/StudyView';
import { DeckBrowser } from './components/DeckBrowser';
import { StatsView } from './components/StatsView';
import { Footer } from './components/Footer';
import { db } from './storage/database';
import { useTheme } from './contexts/ThemeContext';

type View = 'home' | 'study' | 'browse' | 'stats' | 'square' | 'profile';

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
      case 'square':
        return <PlaceholderView title="The Square" subtitle="Community forum coming soon" onBack={() => setCurrentView('home')} />;
      case 'profile':
        return <PlaceholderView title="Profile" subtitle="User profile page coming soon" onBack={() => setCurrentView('home')} />;
      default:
        return <HomeView onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-background relative flex flex-col">
      {/* Navigation Bar */}
      {currentView !== 'home' && (
        <nav className="border-b border-border bg-background/80 backdrop-blur-lg sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-8 py-4">
            <div className="flex items-center justify-center gap-8 text-sm">
              <button
                onClick={() => setCurrentView('study')}
                className={`hover:text-foreground transition-colors ${currentView === 'study' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
              >
                Study
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                onClick={() => setCurrentView('browse')}
                className={`hover:text-foreground transition-colors ${currentView === 'browse' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
              >
                The Commons
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                onClick={() => setCurrentView('square')}
                className={`hover:text-foreground transition-colors ${currentView === 'square' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
              >
                The Square
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                onClick={() => setCurrentView('profile')}
                className={`hover:text-foreground transition-colors ${currentView === 'profile' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
              >
                Profile
              </button>
            </div>
          </div>
        </nav>
      )}

      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="fixed top-1.5 right-4 z-50 p-3 rounded-full bg-gray-100 dark:bg-white/10 backdrop-blur-lg border border-gray-200 dark:border-white/20 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <Sun className="w-5 h-5 text-yellow-400" />
        ) : (
          <Moon className="w-5 h-5 text-gray-700" />
        )}
      </button>

      <div className="flex-1">
        {renderView()}
      </div>

      <Footer onNavigate={(view) => setCurrentView(view)} />
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
          Commonry App
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground text-center mb-8"
        >
          Your commons for lifelong learning
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

interface PlaceholderViewProps {
  title: string;
  subtitle: string;
  onBack: () => void;
}

function PlaceholderView({ title, subtitle, onBack }: PlaceholderViewProps) {
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-8 shadow-2xl max-w-md w-full text-center"
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {title}
        </h1>
        <p className="text-muted-foreground mb-8">
          {subtitle}
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBack}
          className="bg-primary hover:bg-primary/90 text-primary-foreground py-3 px-6 rounded-lg transition-all"
        >
          Back to Home
        </motion.button>
      </motion.div>
    </div>
  );
}

export default App;