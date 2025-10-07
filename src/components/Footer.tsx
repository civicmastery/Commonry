import { Github } from 'lucide-react';

interface FooterProps {
  onNavigate?: (view: 'home') => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="flex items-center">
            <button onClick={() => onNavigate?.('home')} className="cursor-pointer">
              <img
                src="/commonry_text_only.png"
                alt="Commonry"
                className="h-4"
              />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
            <a
              href="#"
              className="hover:text-foreground transition-colors"
            >
              Library
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Github size={16} />
              GitHub
            </a>
            <a
              href="https://bsky.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Bluesky
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
