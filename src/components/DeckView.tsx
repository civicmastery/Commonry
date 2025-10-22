import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Archive,
  AlertCircle,
} from "lucide-react";
import { db } from "../storage/database";
import { Card, Deck } from "../lib/srs-engine";
// skipcq: JS-C1003 - Radix UI Dialog components require namespace import
import * as Dialog from "@radix-ui/react-dialog";

interface DeckViewProps {
  deckId: string;
  onBack: () => void;
}

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  isDestructive?: boolean;
}

function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  message,
  onConfirm,
  confirmText = "Confirm",
  isDestructive = false,
}: ConfirmationDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-white/10">
          <div className="flex items-start gap-4 mb-4">
            <AlertCircle
              size={24}
              className={isDestructive ? "text-red-400" : "text-yellow-400"}
            />
            <div>
              <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {title}
              </Dialog.Title>
              <Dialog.Description className="text-gray-600 dark:text-white/80 text-sm">
                {message}
              </Dialog.Description>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              className={`px-6 py-2 rounded-lg transition-colors ${
                isDestructive
                  ? "bg-red-500/20 hover:bg-red-500/30 text-red-400"
                  : "bg-gray-200 dark:bg-white/20 hover:bg-gray-300 dark:hover:bg-white/30 text-gray-900 dark:text-white"
              }`}
            >
              {confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DeckView({ deckId, onBack }: DeckViewProps) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRetireDialog, setShowRetireDialog] = useState(false);

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");

  const loadDeckAndCards = async () => {
    const deckData = await db.getDeck(deckId);
    setDeck(deckData || null);

    const cardsData = await db.cards.where("deckId").equals(deckId).toArray();
    setCards(cardsData);

    if (deckData) {
      await db.updateDeckStats(deckId);
    }
  };

  useEffect(() => {
    loadDeckAndCards();
  }, [deckId]);

  const handleAddCard = async () => {
    if (!cardFront.trim() || !cardBack.trim()) return;

    await db.createCard(cardFront, cardBack, deckId);
    setCardFront("");
    setCardBack("");
    setShowAddDialog(false);
    await loadDeckAndCards();
  };

  const handleEditCard = async () => {
    if (!selectedCard || !cardFront.trim() || !cardBack.trim()) return;

    await db.cards.update(selectedCard.id, {
      front: cardFront,
      back: cardBack,
    });

    setCardFront("");
    setCardBack("");
    setSelectedCard(null);
    setShowEditDialog(false);
    await loadDeckAndCards();
  };

  const handleDeleteCard = async () => {
    if (!selectedCard) return;

    await db.cards.delete(selectedCard.id);
    setSelectedCard(null);
    setShowDeleteDialog(false);
    await loadDeckAndCards();
  };

  const handleRetireCard = async () => {
    if (!selectedCard) return;

    // Set card due date far in the future to effectively retire it
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 100);

    await db.cards.update(selectedCard.id, {
      due: farFuture,
      status: "review" as const,
    });

    setSelectedCard(null);
    setShowRetireDialog(false);
    await loadDeckAndCards();
  };

  const openEditDialog = (card: Card) => {
    setSelectedCard(card);
    setCardFront(card.front);
    setCardBack(card.back);
    setShowEditDialog(true);
  };

  const openDeleteDialog = (card: Card) => {
    setSelectedCard(card);
    setShowDeleteDialog(true);
  };

  const openRetireDialog = (card: Card) => {
    setSelectedCard(card);
    setShowRetireDialog(true);
  };

  const handleCardFrontChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCardFront(e.target.value);
    },
    [],
  );

  const handleCardBackChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCardBack(e.target.value);
    },
    [],
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "text-blue-400";
      case "learning":
        return "text-yellow-400";
      case "review":
        return "text-green-400";
      case "relearning":
        return "text-orange-400";
      default:
        return "text-gray-500 dark:text-white/60";
    }
  };

  if (!deck) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500 dark:text-white/60">Loading deck...</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/10">
        <div className="flex items-center justify-between p-6 pr-20">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            Back
          </button>

          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {deck.name}
            </h1>
            {deck.description && (
              <p className="text-gray-500 dark:text-white/60 text-sm mt-1">
                {deck.description}
              </p>
            )}
          </div>

          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Plus size={20} />
            Add Card
          </button>
        </div>

        <div className="flex gap-6 px-6 pb-4 text-sm text-gray-600 dark:text-white/80">
          <span>{deck.cardCount} total cards</span>
          <span>{deck.dueCount} due</span>
          <span>{deck.newCount} new</span>
        </div>
      </div>

      {/* Cards List */}
      <div className="p-6">
        {cards.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-100 dark:bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center"
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No cards yet
            </h2>
            <p className="text-gray-600 dark:text-white/80 mb-6">
              Add your first card to start learning
            </p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-6 py-3 bg-gray-200 dark:bg-white/20 hover:bg-gray-300 dark:hover:bg-white/30 text-gray-900 dark:text-white rounded-xl transition-colors"
            >
              Add Card
            </button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-100 dark:bg-white/10 backdrop-blur-lg rounded-xl p-4 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2">
                      <span className="text-xs text-gray-500 dark:text-white/60 uppercase tracking-wide">
                        Front
                      </span>
                      <p className="text-gray-900 dark:text-white mt-1">
                        {card.front}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-white/60 uppercase tracking-wide">
                        Back
                      </span>
                      <p className="text-gray-600 dark:text-white/80 mt-1">
                        {card.back}
                      </p>
                    </div>
                    <div className="flex gap-4 mt-3 text-xs text-gray-500 dark:text-white/60">
                      <span className={getStatusColor(card.status)}>
                        {card.status.toUpperCase()}
                      </span>
                      <span>Reviews: {card.totalReviews}</span>
                      <span>Interval: {card.interval}d</span>
                      <span>Ease: {(card.easeFactor * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditDialog(card)}
                      className="p-2 text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg transition-colors"
                      title="Edit card"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => openRetireDialog(card)}
                      className="p-2 text-gray-500 dark:text-white/60 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors"
                      title="Retire from rotation"
                    >
                      <Archive size={16} />
                    </button>
                    <button
                      onClick={() => openDeleteDialog(card)}
                      className="p-2 text-gray-500 dark:text-white/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete card"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Add Card Dialog */}
      <Dialog.Root open={showAddDialog} onOpenChange={setShowAddDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-200 dark:border-white/10">
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Add New Card
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="create-card-front"
                  className="block text-gray-600 dark:text-white/80 text-sm mb-2"
                >
                  Front
                </label>
                <textarea
                  id="create-card-front"
                  value={cardFront}
                  onChange={handleCardFrontChange}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-gray-400 dark:focus:border-white/40 resize-none"
                  placeholder="Enter the question or prompt"
                  rows={3}
                />
              </div>
              <div>
                <label
                  htmlFor="create-card-back"
                  className="block text-gray-600 dark:text-white/80 text-sm mb-2"
                >
                  Back
                </label>
                <textarea
                  id="create-card-back"
                  value={cardBack}
                  onChange={handleCardBackChange}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-gray-400 dark:focus:border-white/40 resize-none"
                  placeholder="Enter the answer"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleAddCard}
                  disabled={!cardFront.trim() || !cardBack.trim()}
                  className="px-6 py-2 bg-gray-200 dark:bg-white/20 hover:bg-gray-300 dark:hover:bg-white/30 disabled:bg-gray-100 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/40 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  Add Card
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Card Dialog */}
      <Dialog.Root open={showEditDialog} onOpenChange={setShowEditDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-200 dark:border-white/10">
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Edit Card
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="edit-card-front"
                  className="block text-gray-600 dark:text-white/80 text-sm mb-2"
                >
                  Front
                </label>
                <textarea
                  id="edit-card-front"
                  value={cardFront}
                  onChange={handleCardFrontChange}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-gray-400 dark:focus:border-white/40 resize-none"
                  placeholder="Enter the question or prompt"
                  rows={3}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-card-back"
                  className="block text-gray-600 dark:text-white/80 text-sm mb-2"
                >
                  Back
                </label>
                <textarea
                  id="edit-card-back"
                  value={cardBack}
                  onChange={handleCardBackChange}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-gray-400 dark:focus:border-white/40 resize-none"
                  placeholder="Enter the answer"
                  rows={3}
                />
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-200">
                <p className="font-medium mb-1">Note:</p>
                <p className="text-yellow-200/80">
                  Changes will be saved permanently to the deck upon
                  confirmation.
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleEditCard}
                  disabled={!cardFront.trim() || !cardBack.trim()}
                  className="px-6 py-2 bg-gray-200 dark:bg-white/20 hover:bg-gray-300 dark:hover:bg-white/30 disabled:bg-gray-100 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/40 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Card?"
        message="This action will permanently delete this card. This cannot be undone. Are you sure you want to continue?"
        confirmText="Delete"
        isDestructive
        onConfirm={handleDeleteCard}
      />

      {/* Retire Confirmation Dialog */}
      <ConfirmationDialog
        open={showRetireDialog}
        onOpenChange={setShowRetireDialog}
        title="Retire Card from Rotation?"
        message="This will remove the card from your study rotation. You can bring it back later by editing it. Changes will be saved permanently."
        confirmText="Retire"
        isDestructive={false}
        onConfirm={handleRetireCard}
      />
    </div>
  );
}
