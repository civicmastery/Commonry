import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, FolderOpen, Upload, Edit2, Trash2, MoreVertical, Play } from 'lucide-react';
import { db } from '../storage/database';
import { Deck } from '../lib/srs-engine';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { DeckView } from './DeckView';
import { importAnkiDeck } from '../lib/anki-import';

interface DeckBrowserProps {
  onBack: () => void;
  onSelectDeck?: (deckId: string) => void;
  onStartStudy?: (deckId?: string) => void;
}

export function DeckBrowser({ onBack, onSelectDeck, onStartStudy }: DeckBrowserProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDescription, setNewDeckDescription] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [editDeckName, setEditDeckName] = useState('');
  const [editDeckDescription, setEditDeckDescription] = useState('');

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
    setNewDeckName('');
    setNewDeckDescription('');
    setShowCreateDialog(false);
    await loadDecks();
  };

  const handleImportDeck = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const result = await importAnkiDeck(file);
      console.log(`Successfully imported deck: ${result.deckName} with ${result.cardCount} cards`);
      await loadDecks();
      setShowImportDialog(false);
    } catch (error) {
      console.error('Failed to import deck:', error);
      setImportError(error instanceof Error ? error.message : 'Failed to import deck');
    } finally {
      setIsImporting(false);
    }

    // Reset the input so the same file can be selected again
    event.target.value = '';
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
    setEditDeckDescription(deck.description || '');
    setShowEditDialog(true);
  };

  const handleEditDeck = async () => {
    if (!selectedDeck || !editDeckName.trim()) return;

    await db.decks.update(selectedDeck.id, {
      name: editDeckName,
      description: editDeckDescription
    });

    setEditDeckName('');
    setEditDeckDescription('');
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
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pr-20 border-b border-gray-200 dark:border-white/10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>

        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Browse Decks</h1>

        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Plus size={20} />
            Create
          </button>
          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Upload size={20} />
            Import
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {decks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center shadow-lg"
          >
            <FolderOpen size={48} className="mx-auto text-gray-400 dark:text-white/60 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No decks found</h2>
            <p className="text-gray-600 dark:text-white/80 mb-6">
              Create a new deck or import an Anki deck to get started
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setShowCreateDialog(true)}
                className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl transition-colors"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {decks.map((deck) => (
              <motion.div
                key={deck.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-white/10 backdrop-blur-lg rounded-2xl p-6 hover:bg-gray-50 dark:hover:bg-white/15 transition-colors shadow-lg relative group"
              >
                <div className="absolute top-4 right-4">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        className="p-2 rounded-lg text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={18} />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-white/10 p-1 min-w-[160px]"
                        sideOffset={5}
                      >
                        {onStartStudy && (
                          <DropdownMenu.Item
                            className="flex items-center gap-2 px-3 py-2 text-sm text-primary dark:text-primary hover:bg-gray-100 dark:hover:bg-white/10 rounded cursor-pointer outline-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartStudy(deck.id);
                            }}
                          >
                            <Play size={16} />
                            Start Studying
                          </DropdownMenu.Item>
                        )}
                        <DropdownMenu.Item
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 rounded cursor-pointer outline-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(deck);
                          }}
                        >
                          <Edit2 size={16} />
                          Edit Deck
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded cursor-pointer outline-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(deck);
                          }}
                        >
                          <Trash2 size={16} />
                          Delete Deck
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>

                <div onClick={() => handleSelectDeck(deck.id)} className="cursor-pointer">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 pr-8">{deck.name}</h3>
                  {deck.description && (
                    <p className="text-gray-600 dark:text-white/60 text-sm mb-4">{deck.description}</p>
                  )}
                  <div className="flex gap-4 text-sm text-gray-600 dark:text-white/80">
                    <span>{deck.cardCount} cards</span>
                    <span>{deck.dueCount} due</span>
                    <span>{deck.newCount} new</span>
                  </div>
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
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Create New Deck
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">Deck Name</label>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary"
                  placeholder="Enter deck name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">Description (Optional)</label>
                <textarea
                  value={newDeckDescription}
                  onChange={(e) => setNewDeckDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary resize-none"
                  placeholder="Enter deck description"
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
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Import Anki Deck
            </Dialog.Title>
            <div className="space-y-4">
              {importError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">{importError}</p>
                </div>
              )}
              <div className="border-2 border-dashed border-gray-300 dark:border-white/20 rounded-lg p-8 text-center">
                <Upload size={48} className="mx-auto text-gray-400 dark:text-white/60 mb-4" />
                <p className="text-gray-600 dark:text-white/80 mb-4">
                  Select an Anki deck file (.apkg) to import
                </p>
                <label className={`inline-block px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors ${isImporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  {isImporting ? 'Importing...' : 'Choose File'}
                  <input
                    type="file"
                    accept=".apkg"
                    onChange={handleImportDeck}
                    className="hidden"
                    disabled={isImporting}
                  />
                </label>
              </div>
              <div className="flex gap-3 justify-end">
                <Dialog.Close asChild>
                  <button
                    className="px-4 py-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors"
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
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Edit Deck
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">Deck Name</label>
                <input
                  type="text"
                  value={editDeckName}
                  onChange={(e) => setEditDeckName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary"
                  placeholder="Enter deck name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-gray-700 dark:text-white/80 text-sm mb-2">Description (Optional)</label>
                <textarea
                  value={editDeckDescription}
                  onChange={(e) => setEditDeckDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-primary resize-none"
                  placeholder="Enter deck description"
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
            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Delete Deck
            </Dialog.Title>
            <Dialog.Description className="text-gray-600 dark:text-white/80 mb-6">
              Are you sure you want to delete "{selectedDeck?.name}"? This will permanently delete all {selectedDeck?.cardCount} cards in this deck. This action cannot be undone.
            </Dialog.Description>
            <div className="flex gap-3 justify-end">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white transition-colors">
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
    </div>
  );
}