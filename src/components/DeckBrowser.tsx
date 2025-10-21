import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  FolderOpen,
  Upload,
  Edit2,
  Trash2,
  MoreVertical,
  Play,
  Copy,
  Book,
  Clock,
  Sparkles,
  Loader2,
} from "lucide-react";
import { db } from "../storage/database";
import { Deck } from "../lib/srs-engine";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DeckView } from "./DeckView";
import { importAnkiDeck, CardDirection } from "../lib/anki-import";

interface DeckBrowserProps {
  onBack: () => void;
  onSelectDeck?: (deckId: string) => void;
  onStartStudy?: (deckId?: string) => void;
}

export function DeckBrowser({
  onBack,
  onSelectDeck,
  onStartStudy,
}: DeckBrowserProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [editDeckName, setEditDeckName] = useState("");
  const [editDeckDescription, setEditDeckDescription] = useState("");
  const [showCardDirectionDialog, setShowCardDirectionDialog] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [cardDirection, setCardDirection] = useState<CardDirection>("all");

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    const allDecks = await db.getAllDecks();
    // Update deck stats
    for (const deck of allDecks) {
      await db.updateDeckStats(deck.id);
    }
    const updatedDecks = await db.getAllDecks();
    setDecks(updatedDecks);
  };

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;

    await db.createDeck(newDeckName, newDeckDescription);
    setNewDeckName("");
    setNewDeckDescription("");
    setShowCreateDialog(false);
    await loadDecks();
  };

  const handleImportDeck = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Store the file and show card direction dialog
    setPendingImportFile(file);
    setShowCardDirectionDialog(true);

    // Reset the input so the same file can be selected again
    event.target.value = "";
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;

    setIsImporting(true);
    setImportError(null);
    setShowCardDirectionDialog(false);

    try {
      const result = await importAnkiDeck(pendingImportFile, cardDirection);
      console.log(
        `Successfully imported deck: ${result.deckName} with ${result.cardCount} cards`,
      );
      await loadDecks();
      setShowImportDialog(false);
    } catch (error) {
      console.error("Failed to import deck:", error);
      setImportError(
        error instanceof Error ? error.message : "Failed to import deck",
      );
    } finally {
      setIsImporting(false);
      setPendingImportFile(null);
    }
  };

  const handleSelectDeck = (deckId: string) => {
    if (onSelectDeck) {
      onSelectDeck(deckId);
    } else {
      setSelectedDeckId(deckId);
    }
  };

  const openEditDialog = (deck: Deck) => {
    setSelectedDeck(deck);
    setEditDeckName(deck.name);
    setEditDeckDescription(deck.description || "");
    setShowEditDialog(true);
  };

  const handleEditDeck = async () => {
    if (!selectedDeck || !editDeckName.trim()) return;

    await db.decks.update(selectedDeck.id, {
      name: editDeckName,
      description: editDeckDescription,
    });

    setEditDeckName("");
    setEditDeckDescription("");
    setSelectedDeck(null);
    setShowEditDialog(false);
    await loadDecks();
  };

  const openDeleteDialog = (deck: Deck) => {
    setSelectedDeck(deck);
    setShowDeleteDialog(true);
  };

  const handleDeleteDeck = async () => {
    if (!selectedDeck) return;

    await db.deleteDeck(selectedDeck.id);
    setSelectedDeck(null);
    setShowDeleteDialog(false);
    await loadDecks();
  };

  const handleDuplicateDeck = async (deck: Deck) => {
    const newDeckName = `${deck.name} (Copy)`;
    const newDeck = await db.createDeck(newDeckName, deck.description);

    // Copy all cards from the original deck to the new deck
    const cards = await db.cards.where("deckId").equals(deck.id).toArray();
    for (const card of cards) {
      // Omit id to let Dexie auto-generate, then add the new deckId
      const { id, ...cardWithoutId } = card;
      await db.cards.add({
        ...cardWithoutId,
        deckId: newDeck.id,
      });
    }

    await loadDecks();
  };

  // Memoized handlers for JSX props
  const handleCardDirectionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCardDirection(e.target.value as CardDirection);
    },
    [],
  );

  const handleDeckClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const deckId = e.currentTarget.dataset.deckId;
    if (deckId) handleSelectDeck(deckId);
  }, []);

  const handleStudyClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const deckId = e.currentTarget.dataset.deckId;
      if (deckId) {
        if (onStartStudy) {
          onStartStudy(deckId);
        } else {
          handleSelectDeck(deckId);
        }
      }
    },
    [onStartStudy],
  );

  const handleDuplicateClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const deckIndex = e.currentTarget.dataset.deckIndex;
      if (deckIndex !== undefined) {
        const deck = decks[parseInt(deckIndex)];
        if (deck) handleDuplicateDeck(deck);
      }
    },
    [decks],
  );

  const getGradientClass = (index: number): string => {
    const gradients = [
      "bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500",
      "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500",
      "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500",
      "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500",
      "bg-gradient-to-r from-pink-500 via-rose-500 to-red-500",
      "bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500",
    ];
    return gradients[index % gradients.length];
  };

  // If a deck is selected, show the DeckView
  if (selectedDeckId) {
    return (
      <DeckView
        deckId={selectedDeckId}
        onBack={() => {
          setSelectedDeckId(null);
          loadDecks();
        }}
      />
    );
  }

  return (
    <div className="bg-white dark:bg-black h-full">
      {/* Header */}
      <div className="border-b border-border py-14">
        <div className="flex items-center justify-between px-8 relative">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={20} />
            Back
          </button>

          <h1 className="text-xl font-medium absolute left-1/2 -translate-x-1/2">
            Browse Decks
          </h1>

          <div className="flex gap-6">
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus size={20} />
              Create
            </button>
            <button
              onClick={() => setShowImportDialog(true)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Upload size={20} />
              Import
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {decks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-lg p-8 text-center "
          >
            <FolderOpen
              size={48}
              className="mx-auto text-gray-400 dark:text-white/60 mb-4"
            />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              No decks found
            </h2>
            <p className="text-gray-600 dark:text-white/80 mb-6">
              Create a new deck or import an Anki deck to get started
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setShowCreateDialog(true)}
                className="px-6 py-3 bg-primary hover:opacity-90 text-primary-foreground rounded transition-colors"
              >
                Create Deck
              </button>
              <button
                onClick={() => setShowImportDialog(true)}
                className="px-6 py-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl transition-colors"
              >
                Import Deck
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map((deck, index) => (
              <motion.div
                key={deck.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4, scale: 1.02 }}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm hover:shadow-xl transition-all duration-200 overflow-hidden group"
              >
                {/* Gradient Header */}
                <div
                  className={`h-16 ${getGradientClass(index)} relative flex items-center justify-between px-4`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="text-white" size={20} />
                    <span className="text-white font-semibold text-sm">
                      Study Deck
                    </span>
                  </div>

                  {/* 3-Dot Menu in Header */}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        className="p-1.5 rounded-lg text-white hover:bg-white/20 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={18} />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-1 min-w-[160px] z-50"
                        sideOffset={5}
                      >
                        <DropdownMenu.Item
                          className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer outline-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(deck);
                          }}
                        >
                          <Edit2 size={16} className="text-indigo-500" />
                          Edit Deck
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer outline-none"
                          onClick={handleDuplicateClick}
                          data-deck-index={index}
                        >
                          <Copy size={16} className="text-blue-500" />
                          Duplicate
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded cursor-pointer outline-none border-t border-gray-200 dark:border-gray-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(deck);
                          }}
                        >
                          <Trash2 size={16} />
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>

                {/* Card Content */}
                <div className="p-5">
                  <div
                    onClick={handleDeckClick}
                    data-deck-id={deck.id}
                    className="cursor-pointer mb-4"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {deck.name}
                    </h3>
                    {deck.description && (
                      <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                        {deck.description}
                      </p>
                    )}
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                      <Book
                        className="mx-auto mb-1 text-gray-600 dark:text-gray-400"
                        size={16}
                      />
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {deck.cardCount}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Cards
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                      <Clock
                        className="mx-auto mb-1 text-orange-600 dark:text-orange-400"
                        size={16}
                      />
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {deck.dueCount}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Due
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                      <Sparkles
                        className="mx-auto mb-1 text-blue-600 dark:text-blue-400"
                        size={16}
                      />
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {deck.newCount}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        New
                      </p>
                    </div>
                  </div>

                  {/* Study Now Button */}
                  <button
                    onClick={handleStudyClick}
                    data-deck-id={deck.id}
                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                  >
                    <Play size={18} />
                    Study Now
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Deck Dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-white/10">
            <Dialog.Title className="text-xl font-semibold text-foreground mb-4">
              Create New Deck
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">
                  Deck Name
                </label>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-foreground placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary"
                  placeholder="Enter deck name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={newDeckDescription}
                  onChange={(e) => setNewDeckDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-foreground placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary resize-none"
                  placeholder="Enter deck description"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleCreateDeck}
                  disabled={!newDeckName.trim()}
                  className="px-6 py-2 bg-primary hover:bg-primary/90 disabled:bg-gray-300 dark:disabled:bg-white/10 disabled:text-gray-500 dark:disabled:text-white/40 text-white rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Import Deck Dialog */}
      <Dialog.Root open={showImportDialog} onOpenChange={setShowImportDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-white/10">
            <Dialog.Title className="text-xl font-semibold text-foreground mb-4">
              Import Anki Deck
            </Dialog.Title>
            <div className="space-y-4">
              {importError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">
                    {importError}
                  </p>
                </div>
              )}

              {isImporting ? (
                <div className="border-2 border-gray-300 dark:border-white/20 rounded-lg p-8 text-center bg-gray-50 dark:bg-white/5">
                  <Loader2
                    size={48}
                    className="mx-auto text-indigo-600 dark:text-indigo-400 mb-4 animate-spin"
                  />
                  <p className="text-gray-900 dark:text-white font-semibold text-lg mb-2">
                    Importing Deck...
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Please wait while we process your Anki deck
                  </p>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 dark:border-white/20 rounded-lg p-8 text-center hover:border-gray-400 dark:hover:border-white/30 transition-colors">
                  <Upload
                    size={48}
                    className="mx-auto text-gray-400 dark:text-white/60 mb-4"
                  />
                  <p className="text-gray-600 dark:text-white/80 mb-4">
                    Select an Anki deck file (.apkg) to import
                  </p>
                  <label className="inline-block px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors cursor-pointer">
                    Choose File
                    <input
                      type="file"
                      accept=".apkg"
                      onChange={handleImportDeck}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Dialog.Close asChild>
                  <button
                    className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    disabled={isImporting}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit Deck Dialog */}
      <Dialog.Root open={showEditDialog} onOpenChange={setShowEditDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-white/10">
            <Dialog.Title className="text-xl font-semibold text-foreground mb-4">
              Edit Deck
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">
                  Deck Name
                </label>
                <input
                  type="text"
                  value={editDeckName}
                  onChange={(e) => setEditDeckName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-foreground placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary"
                  placeholder="Enter deck name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={editDeckDescription}
                  onChange={(e) => setEditDeckDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-foreground placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary resize-none"
                  placeholder="Enter deck description"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleEditDeck}
                  disabled={!editDeckName.trim()}
                  className="px-6 py-2 bg-primary hover:bg-primary/90 disabled:bg-gray-300 dark:disabled:bg-white/10 disabled:text-gray-500 dark:disabled:text-white/40 text-white rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Deck Dialog */}
      <Dialog.Root open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-white/10">
            <Dialog.Title className="text-xl font-semibold text-foreground mb-4">
              Delete Deck
            </Dialog.Title>
            <Dialog.Description className="text-gray-600 dark:text-white/80 mb-6">
              Are you sure you want to delete &quot;{selectedDeck?.name}&quot;?
              This will permanently delete all {selectedDeck?.cardCount} cards
              in this deck. This action cannot be undone.
            </Dialog.Description>
            <div className="flex gap-3 justify-end">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleDeleteDeck}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Delete Deck
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Card Direction Dialog */}
      <Dialog.Root
        open={showCardDirectionDialog}
        onOpenChange={setShowCardDirectionDialog}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-white/10">
            <Dialog.Title className="text-xl font-semibold text-foreground mb-4">
              Choose Card Direction
            </Dialog.Title>
            <Dialog.Description className="text-gray-600 dark:text-white/80 mb-6">
              Select which cards to import from this deck:
            </Dialog.Description>

            <div className="space-y-3 mb-6">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">
                <input
                  type="radio"
                  name="cardDirection"
                  value="all"
                  checked={cardDirection === "all"}
                  onChange={handleCardDirectionChange}
                  className="mt-1"
                />
                <div>
                  <div className="font-semibold text-foreground">
                    Both Directions
                  </div>
                  <div className="text-sm text-gray-600 dark:text-white/60">
                    Import all cards (bidirectional learning)
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">
                <input
                  type="radio"
                  name="cardDirection"
                  value="forward"
                  checked={cardDirection === "forward"}
                  onChange={handleCardDirectionChange}
                  className="mt-1"
                />
                <div>
                  <div className="font-semibold text-foreground">
                    Forward Only
                  </div>
                  <div className="text-sm text-gray-600 dark:text-white/60">
                    First card template only (e.g., Image → Text)
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">
                <input
                  type="radio"
                  name="cardDirection"
                  value="reverse"
                  checked={cardDirection === "reverse"}
                  onChange={handleCardDirectionChange}
                  className="mt-1"
                />
                <div>
                  <div className="font-semibold text-foreground">
                    Reverse Only
                  </div>
                  <div className="text-sm text-gray-600 dark:text-white/60">
                    Second card template only (e.g., Text → Image)
                  </div>
                </div>
              </label>
            </div>

            <div className="flex gap-3 justify-end">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleConfirmImport}
                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
              >
                Import
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
