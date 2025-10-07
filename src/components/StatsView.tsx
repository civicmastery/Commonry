import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, Clock, Target } from 'lucide-react';

interface StatsViewProps {
  onBack: () => void;
}

export function StatsView({ onBack }: StatsViewProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <div className="flex items-center justify-between p-8 border-b border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>

        <h1 className="text-xl font-medium">Statistics</h1>

        <div></div>
      </div>

      {/* Content */}
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { icon: Target, label: 'Cards Studied Today', value: '0' },
            { icon: Clock, label: 'Time Spent', value: '0 min' },
            { icon: TrendingUp, label: 'Retention Rate', value: '0%' }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-lg p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <stat.icon size={24} className="text-muted-foreground" />
                <span className="text-muted-foreground text-sm">{stat.label}</span>
              </div>
              <div className="text-3xl font-medium">{stat.value}</div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-lg p-8 text-center"
        >
          <TrendingUp size={48} className="mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-medium mb-2">No data yet</h2>
          <p className="text-muted-foreground">
            Start studying to see your progress and statistics
          </p>
        </motion.div>
      </div>
    </div>
  );
}