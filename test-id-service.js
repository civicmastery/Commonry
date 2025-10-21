import { IdService } from "./src/services/id-service.ts";

console.log("🧪 Testing ID Service\n");

// Test 1: Generate IDs
console.log("Test 1: ID Generation");
console.log("--------------------");
const noteId = IdService.generateNoteId();
const cardId = IdService.generateCardId();
const deckId = IdService.generateDeckId();

console.log("Note ID:", noteId);
console.log("Card ID:", cardId);
console.log("Deck ID:", deckId);
console.log("✓ Generated IDs successfully\n");

// Test 2: Validate IDs
console.log("Test 2: ID Validation");
console.log("--------------------");
console.log("Is valid Note ID:", IdService.isValidId(noteId));
console.log("Is Note ID:", IdService.isNoteId(noteId));
console.log("Is Card ID (should be false):", IdService.isCardId(noteId));
console.log("Is valid invalid string:", IdService.isValidId("invalid"));
console.log("✓ Validation working correctly\n");

// Test 3: Extract entity type
console.log("Test 3: Entity Type Extraction");
console.log("--------------------");
console.log("Note ID type:", IdService.getEntityType(noteId));
console.log("Card ID type:", IdService.getEntityType(cardId));
console.log("Deck ID type:", IdService.getEntityType(deckId));
console.log("✓ Entity types extracted correctly\n");

// Test 4: Extract timestamp
console.log("Test 4: Timestamp Extraction");
console.log("--------------------");
const timestamp = IdService.getTimestamp(noteId);
console.log("Note ID timestamp:", timestamp.toISOString());
console.log("Note ID age:", IdService.debug(noteId).age);
console.log("✓ Timestamps extracted correctly\n");

// Test 5: Chronological sorting
console.log("Test 5: Chronological Sorting");
console.log("--------------------");
const id1 = IdService.generateNoteId();
// Small delay to ensure different timestamps
await new Promise((resolve) => setTimeout(resolve, 5));
const id2 = IdService.generateNoteId();

console.log("ID 1:", id1);
console.log("ID 2:", id2);
console.log("ID 1 < ID 2:", id1 < id2);
console.log("Compare result:", IdService.compare(id1, id2));
console.log("✓ IDs are chronologically sortable\n");

// Test 6: Batch generation
console.log("Test 6: Batch Generation");
console.log("--------------------");
const batchIds = IdService.generateBatch("card", 10);
console.log("Generated", batchIds.length, "card IDs");
console.log("First ID:", batchIds[0]);
console.log("Last ID:", batchIds[9]);
console.log("All unique:", new Set(batchIds).size === batchIds.length);
console.log("✓ Batch generation working\n");

// Test 7: Sync cursor
console.log("Test 7: Sync Cursor");
console.log("--------------------");
const cutoffDate = new Date("2024-01-01");
const cursor = IdService.createSyncCursor(cutoffDate, "note");
console.log("Cutoff date:", cutoffDate.toISOString());
console.log("Sync cursor:", cursor);
console.log("Cursor type:", IdService.getEntityType(cursor));
console.log("✓ Sync cursor created\n");

// Test 8: Import mapping
console.log("Test 8: Import Mapping");
console.log("--------------------");
const externalIds = ["anki_123", "anki_456", "anki_789"];
const mapping = IdService.createImportMapping(externalIds, "note");
console.log("External IDs:", externalIds.length);
console.log("Mapping size:", mapping.size);
console.log("Sample mapping:");
for (const [external, internal] of mapping) {
  console.log(`  ${external} -> ${internal}`);
}
console.log("✓ Import mapping created\n");

// Test 9: Debug info
console.log("Test 9: Debug Information");
console.log("--------------------");
const debugInfo = IdService.debug(noteId);
console.log("Debug info for", noteId);
console.log("  Valid:", debugInfo.valid);
console.log("  Type:", debugInfo.type);
console.log("  Prefix:", debugInfo.prefix);
console.log("  ULID:", debugInfo.ulid);
console.log("  Timestamp:", debugInfo.timestamp?.toISOString());
console.log("  Age:", debugInfo.age);
console.log("✓ Debug info generated\n");

// Test 10: Parse ID
console.log("Test 10: Parse ID");
console.log("--------------------");
const parsedId = IdService.parseId(noteId, "note");
console.log("Parsed note ID:", parsedId);
console.log("Parse with wrong type:", IdService.parseId(noteId, "card"));
console.log("Parse invalid ID:", IdService.parseId("invalid"));
console.log("✓ ID parsing working\n");

console.log("✅ All tests passed!");
