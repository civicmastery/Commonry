import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles, Zap, Target } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary">
      {/* Hero Section */}
      <section className="relative px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Learn Smarter with{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-pink-200">
                AestheticSRS
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-white/80">
              A beautiful, modern spaced repetition system that makes learning enjoyable.
              Import your Anki decks and experience studying reimagined.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn btn-primary bg-white text-primary hover:bg-white/90 px-8 py-3"
              >
                Start Learning
              </motion.button>
              <button className="text-sm font-semibold leading-6 text-white hover:text-white/80">
                Learn more <span aria-hidden="true">→</span>
              </button>
            </div>
          </motion.div>
        </div>

        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <svg
            className="absolute left-1/2 top-0 -z-10 h-[64rem] w-[128rem] -translate-x-1/2 stroke-white/10 [mask-image:radial-gradient(64rem_32rem_at_center,white,transparent)]"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id="grid-pattern"
                width={200}
                height={200}
                x="50%"
                y={-1}
                patternUnits="userSpaceOnUse"
              >
                <path d="M100 200V.5M.5 .5H200" fill="none" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" strokeWidth={0} fill="url(#grid-pattern)" />
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Everything you need to master anything
            </h2>
            <p className="mt-6 text-lg leading-8 text-white/80">
              Powerful features wrapped in a delightful interface
            </p>
          </div>
          
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {[
                {
                  name: 'Smart Scheduling',
                  description: 'Advanced algorithms that adapt to your learning patterns for optimal retention.',
                  icon: Brain,
                },
                {
                  name: 'Beautiful Design',
                  description: 'A clean, distraction-free interface that makes studying a pleasure.',
                  icon: Sparkles,
                },
                {
                  name: 'Lightning Fast',
                  description: 'Built for performance with instant card flips and smooth animations.',
                  icon: Zap,
                },
              ].map((feature) => (
                <motion.div
                  key={feature.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                  className="flex flex-col"
                >
                  <dt className="text-base font-semibold leading-7 text-white">
                    <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                      <feature.icon className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    {feature.name}
                  </dt>
                  <dd className="mt-1 flex flex-auto flex-col text-base leading-7 text-white/70">
                    <p className="flex-auto">{feature.description}</p>
                  </dd>
                </motion.div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}