import Database from './storage/database.js';

class StudySession {
  constructor() {
    this.db = new Database();
    this.currentCard = null;
    this.showingBack = false;
    this.contentEl = document.getElementById('content');
    this.buttonsEl = document.getElementById('buttons');
  }

  async start() {
    // Initialize database
    const initialized = await this.db.initialize();
    if (!initialized) {
      this.showError('Failed to initialize database');
      return;
    }

    // Check if we need to add sample cards
    const cardCount = await this.db.getCardCount();
    if (cardCount === 0) {
      await this.addSampleCards();
    }

    // Start showing cards
    await this.showNextCard();
  }

  async addSampleCards() {
    const sampleCards = [
      {
        front: "What is the capital of France?",
        back: "Paris"
      },
      {
        front: "What is 2 + 2?",
        back: "4"
      },
      {
        front: "What is the largest planet in our solar system?",
        back: "Jupiter"
      }
    ];

    for (const card of sampleCards) {
      await this.db.saveCard(card);
    }
    console.log('Sample cards added');
  }

  async showNextCard() {
    this.currentCard = await this.db.getNextCard();
    
    if (!this.currentCard) {
      const totalCards = await this.db.getCardCount();
      if (totalCards === 0) {
        this.showNoCards();
      } else {
        this.showComplete();
      }
      return;
    }

    this.showCard();
  }

  showCard() {
    if (!this.showingBack) {
      // Show front of card
      this.contentEl.textContent = this.currentCard.front;
      this.buttonsEl.innerHTML = `
        <button onclick="study.flip()" style="background: #4299e1; color: white;">
          Show Answer
        </button>
      `;
    } else {
      // Show back of card
      this.contentEl.innerHTML = `
        <div style="margin-bottom: 24px; color: #718096; font-size: 18px;">Question:</div>
        <div style="margin-bottom: 32px; font-size: 20px;">${this.currentCard.front}</div>
        <div style="margin-bottom: 24px; color: #718096; font-size: 18px;">Answer:</div>
        <div>${this.currentCard.back}</div>
      `;
      
      // Show rating buttons
      this.buttonsEl.innerHTML = `
        <button onclick="study.rate(1)" style="background: #f56565; color: white;">
          Again
        </button>
        <button onclick="study.rate(2)" style="background: #ed8936; color: white;">
          Hard
        </button>
        <button onclick="study.rate(3)" style="background: #48bb78; color: white;">
          Good
        </button>
        <button onclick="study.rate(4)" style="background: #38b2ac; color: white;">
          Easy
        </button>
      `;
    }
  }

  flip() {
    this.showingBack = true;
    this.showCard();
  }

  async rate(rating) {
    console.log(`Card ${this.currentCard.id} rated: ${rating}`);
    
    // Record the review in database
    await this.db.recordReview(this.currentCard.id, rating);
    
    // Move to next card
    this.showingBack = false;
    await this.showNextCard();
  }

  showComplete() {
    this.contentEl.innerHTML = `
      <div style="text-align: center;">
        <h2 style="color: #48bb78; margin-bottom: 16px;">Session Complete!</h2>
        <p>No more cards due for review right now.</p>
      </div>
    `;
    this.buttonsEl.innerHTML = `
      <button onclick="study.refresh()" style="background: #4299e1; color: white;">
        Check for New Cards
      </button>
    `;
  }

  showNoCards() {
    this.contentEl.innerHTML = `
      <div style="text-align: center;">
        <h2 style="color: #e53e3e; margin-bottom: 16px;">No Cards Available</h2>
        <p>Add some cards to start studying!</p>
      </div>
    `;
    this.buttonsEl.innerHTML = '';
  }

  showError(message) {
    this.contentEl.innerHTML = `
      <div style="text-align: center;">
        <h2 style="color: #e53e3e; margin-bottom: 16px;">Error</h2>
        <p>${message}</p>
      </div>
    `;
    this.buttonsEl.innerHTML = '';
  }

  async refresh() {
    this.showingBack = false;
    await this.showNextCard();
  }
}

// Initialize study session
const study = new StudySession();
window.study = study; // Make it accessible globally for onclick handlers

// Start when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  await study.start();
});