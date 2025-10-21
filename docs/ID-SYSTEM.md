# Commonry ID System Documentation

## Overview

The Commonry ID system uses prefixed ULIDs (Universally Unique Lexicographically Sortable Identifiers) to provide type-safe, chronologically sortable, and sync-friendly identifiers for all entities in the application.

## Key Features

1. **Type Safety**: TypeScript prevents ID type confusion at compile time
2. **Sortable**: IDs are chronologically ordered
3. **Offline-First**: Generate IDs without server coordination
4. **Debuggable**: See entity type and creation time from the ID
5. **Sync-Friendly**: Efficient range queries for data synchronization
6. **Self-Documenting**: Prefix shows entity type
7. **Collision-Resistant**: 128-bit ULID ensures uniqueness
8. **Database-Optimized**: Better index performance than random UUIDs

## ID Format

Each ID has the format: `{prefix}_{ulid}`

Example IDs:

- `not_01K84EYHF0AW2Z6NM0KMPG5BWA` - Note ID
- `crd_01K84EYHF2X8J8TCCDXYX8MA2N` - Card ID
- `dck_01K84EYHF2EPB0M92QRX1SGC70` - Deck ID

### Entity Prefixes

| Entity Type   | Prefix | Example                          |
| ------------- | ------ | -------------------------------- |
| Note          | `not`  | `not_01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| Card          | `crd`  | `crd_01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| Deck          | `dck`  | `dck_01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| Review        | `rev`  | `rev_01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| Media         | `med`  | `med_01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| User          | `usr`  | `usr_01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| Card Model    | `mdl`  | `mdl_01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| Card Template | `tpl`  | `tpl_01ARZ3NDEKTSV4RRFFQ69G5FAV` |

## Usage Examples

### Basic ID Generation

```typescript
import { IdService } from "./services/id-service";

// Generate IDs
const noteId = IdService.generateNoteId();
const cardId = IdService.generateCardId();
const deckId = IdService.generateDeckId();

console.log(noteId); // "not_01ARZ3NDEKTSV4RRFFQ69G5FAV"
console.log(cardId); // "crd_01ARZ3NDEKTSV4RRFFQ69G5FAV"
console.log(deckId); // "dck_01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

### Type Safety

```typescript
import { NoteId, CardId } from "./types/ids";

interface Note {
  id: NoteId;
  content: string;
}

const note: Note = {
  id: IdService.generateNoteId(),
  content: "Hello world",
};

// TypeScript error - can't use CardId as NoteId
// const badNote: Note = {
//   id: IdService.generateCardId(), // ❌ Type error!
//   content: 'Bad',
// };
```

### Validation

```typescript
// Validate any ID
const isValid = IdService.isValidId(noteId); // true

// Type-specific validation
IdService.isNoteId(noteId); // true
IdService.isCardId(noteId); // false

// Parse and validate
const parsedId = IdService.parseId(noteId, "note"); // Returns NoteId
const wrongType = IdService.parseId(noteId, "card"); // Returns null
```

### Extracting Information

```typescript
// Get entity type
const type = IdService.getEntityType(noteId); // 'note'

// Get timestamp
const timestamp = IdService.getTimestamp(noteId); // Date object

// Debug information
const debug = IdService.debug(noteId);
console.log(debug);
// {
//   valid: true,
//   type: 'note',
//   prefix: 'not',
//   ulid: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
//   timestamp: Date,
//   age: '5m ago'
// }
```

### Chronological Sorting

```typescript
const id1 = IdService.generateNoteId();
await new Promise((resolve) => setTimeout(resolve, 10));
const id2 = IdService.generateNoteId();

// IDs are lexicographically sortable
console.log(id1 < id2); // true

// Compare IDs
IdService.compare(id1, id2); // -1 (id1 is earlier)

// Check if created after timestamp
const cutoff = new Date("2024-01-01");
IdService.isCreatedAfter(id2, cutoff); // true
```

### Sync and Pagination

```typescript
async function syncNotes(lastSyncTime: Date) {
  // Create cursor for efficient querying
  const cursor = IdService.createSyncCursor(lastSyncTime, "note");

  // Query notes created after cursor
  const notes = await db.notes
    .where("id")
    .above(cursor) // Lexicographic comparison
    .toArray();

  return notes;
}
```

### Batch Operations

```typescript
// Generate multiple IDs at once
const cardIds = IdService.generateBatch("card", 100);

console.log(cardIds.length); // 100
console.log(cardIds[0]); // "crd_01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

### Import/Export

```typescript
async function importAnkiDeck(ankiData: any) {
  // Create ID mapping for external IDs
  const noteMapping = IdService.createImportMapping(
    ankiData.notes.map((n) => n.id),
    "note",
  );

  // Import with new IDs
  for (const ankiNote of ankiData.notes) {
    const newId = noteMapping.get(ankiNote.id)!;

    await db.notes.add({
      id: newId,
      fields: ankiNote.fields,
    });
  }
}
```

## Database Integration

### Dexie Schema

```typescript
import Dexie, { Table } from "dexie";
import { CardId, DeckId } from "./types/ids";

class AppDatabase extends Dexie {
  cards!: Table<Card>;
  decks!: Table<Deck>;

  constructor() {
    super("AppDatabase");

    this.version(1).stores({
      cards: "id, deckId, due, status",
      decks: "id, name",
    });
  }
}

interface Card {
  id: CardId;
  deckId: DeckId;
  due: Date;
  status: string;
}

interface Deck {
  id: DeckId;
  name: string;
}
```

### Queries

```typescript
// Get card by ID
const card = await db.cards.get(cardId);

// Get all cards in a deck
const deckCards = await db.cards.where("deckId").equals(deckId).toArray();

// Get cards created after a certain time
const recentCards = await db.cards
  .where("id")
  .above(IdService.createSyncCursor(cutoffDate, "card"))
  .toArray();
```

## API Integration

### Request Validation Middleware

```typescript
import { IdService } from "./services/id-service";

function validateDeckId(req, res, next) {
  const { deckId } = req.params;

  if (!IdService.isDeckId(deckId)) {
    return res.status(400).json({
      error: "Invalid deck ID format",
    });
  }

  next();
}

app.get("/api/decks/:deckId", validateDeckId, async (req, res) => {
  const deck = await db.decks.get(req.params.deckId);
  res.json(deck);
});
```

## Performance

- **ID Generation**: ~1-2 million IDs per second
- **No Network Calls**: Generate IDs offline
- **Efficient Sorting**: Lexicographic sorting is optimized in databases
- **Compact**: 30 characters total (3 prefix + 1 underscore + 26 ULID)
- **Index-Friendly**: Sequential IDs provide better B-tree performance than random UUIDs

## Migration Guide

### From Old String IDs

```typescript
// Before
interface Card {
  id: string; // "card_1234567890_abc123"
  deckId: string;
}

// After
import { CardId, DeckId } from "./types/ids";

interface Card {
  id: CardId; // "crd_01ARZ3NDEKTSV4RRFFQ69G5FAV"
  deckId: DeckId;
}

// Update creation code
// Before
const card = {
  id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  deckId: someDeckId,
};

// After
const card = {
  id: IdService.generateCardId(),
  deckId: someDeckId,
};
```

## Best Practices

1. **Always use IdService for generation**: Don't create IDs manually
2. **Use typed IDs in interfaces**: Leverage TypeScript's type system
3. **Validate external IDs**: Use `parseId` for untrusted sources
4. **Use sync cursors**: For efficient pagination and synchronization
5. **Debug with IdService.debug()**: When troubleshooting ID-related issues

## Common Patterns

### Creating Entities

```typescript
async function createCard(
  front: string,
  back: string,
  deckId: DeckId,
): Promise<CardId> {
  const card = {
    id: IdService.generateCardId(),
    front,
    back,
    deckId,
    created: new Date(),
  };

  await db.cards.add(card);
  return card.id;
}
```

### Querying by Time Range

```typescript
async function getCardsCreatedBetween(start: Date, end: Date): Promise<Card[]> {
  const startCursor = IdService.createSyncCursor(start, "card");
  const endCursor = IdService.createSyncCursor(end, "card");

  return await db.cards
    .where("id")
    .between(startCursor, endCursor, true, true)
    .toArray();
}
```

### Importing from External Systems

```typescript
async function importExternalData(externalCards: ExternalCard[]) {
  // Create ID mapping
  const mapping = IdService.createImportMapping(
    externalCards.map((c) => c.externalId),
    "card",
  );

  // Import with internal IDs
  for (const external of externalCards) {
    const internalId = mapping.get(external.externalId)!;

    await db.cards.add({
      id: internalId,
      front: external.question,
      back: external.answer,
      // ... other fields
    });
  }
}
```

## Troubleshooting

### "Invalid ID format" errors

```typescript
// Check if ID is valid
if (!IdService.isValidId(id)) {
  console.error("Invalid ID:", id);
  console.log("Debug:", IdService.debug(id));
}
```

### Type errors with IDs

```typescript
// Ensure you're using the correct type
function getCard(id: CardId) {
  // ✅ Typed parameter
  // ...
}

// If you have a string, validate and cast
const id = IdService.parseId(stringId, "card");
if (id) {
  getCard(id);
}
```

### Sync issues

```typescript
// Make sure cursor is created with correct timestamp and type
const cursor = IdService.createSyncCursor(lastSyncTime, "card");

// Verify cursor is valid
console.log(IdService.debug(cursor));
```

## References

- [ULID Specification](https://github.com/ulid/spec)
- [TypeScript Branded Types](https://egghead.io/blog/using-branded-types-in-typescript)
- [Dexie.js Documentation](https://dexie.org/)

## Support

For questions or issues with the ID system, please check the troubleshooting section or consult the development team.
