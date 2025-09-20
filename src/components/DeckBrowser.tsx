import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, FolderOpen } from 'lucide-react';

interface DeckBrowserProps {
  onBack: () => void;
}

export function DeckBrowser({ onBack }: DeckBrowserProps) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        
        <h1 className="text-xl font-semibold text-white">Browse Decks</h1>
        
        <button className="flex items-center gap-2 text-white/80 hover:text-white transition-colors">
          <Plus size={20} />
          Import
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center"
        >
          <FolderOpen size={48} className="mx-auto text-white/60 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No decks found</h2>
          <p className="text-white/80 mb-6">
            Import your first Anki deck to get started
          </p>
          <button className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors">
            Import Deck
          </button>
        </motion.div>
      </div>
    </div>
  );
}