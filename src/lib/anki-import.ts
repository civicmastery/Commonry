// src/lib/anki-import.ts
import JSZip from "jszip";
import initSqlJs, { Database } from "sql.js";
import { decompress } from "fzstd";
import { db } from "../storage/database";
import { ImportMappingService } from "../services/import-mapping-service";

export interface AnkiImportResult {
  deckName: string;
  cardCount: number;
  deckId: string;
  isReimport: boolean;
  importBatchId: string;
}

export type CardDirection = "all" | "forward" | "reverse";

// Anki model (note type) structure
interface AnkiField {
  name: string;
  ord: number;
  sticky?: boolean;
  rtl?: boolean;
  font?: string;
  size?: number;
}

interface AnkiTemplate {
  name: string;
  qfmt: string; // Question format (front of card)
  afmt: string; // Answer format (back of card)
  bqfmt?: string;
  bafmt?: string;
  did?: number;
  ord?: number;
}

interface AnkiModel {
  id: string;
  name: string;
  flds: AnkiField[];
  tmpls: AnkiTemplate[];
  css?: string;
  type?: number;
  mod?: number;
}

// Store media files in IndexedDB
async function storeMediaFile(
  fileName: string,
  data: Uint8Array,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AnkiMedia", 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "fileName" });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction(["media"], "readwrite");
      const store = transaction.objectStore("media");

      // Determine MIME type based on file extension
      let mimeType = "application/octet-stream";
      const lowerFileName = fileName.toLowerCase();

      // Audio types
      if (lowerFileName.endsWith(".mp3")) {
        mimeType = "audio/mpeg";
      } else if (lowerFileName.endsWith(".wav")) {
        mimeType = "audio/wav";
      } else if (lowerFileName.endsWith(".ogg")) {
        mimeType = "audio/ogg";
      }
      // Image types
      else if (
        lowerFileName.endsWith(".jpg") ||
        lowerFileName.endsWith(".jpeg")
      ) {
        mimeType = "image/jpeg";
      } else if (lowerFileName.endsWith(".png")) {
        mimeType = "image/png";
      } else if (lowerFileName.endsWith(".gif")) {
        mimeType = "image/gif";
      } else if (lowerFileName.endsWith(".webp")) {
        mimeType = "image/webp";
      } else if (lowerFileName.endsWith(".svg")) {
        mimeType = "image/svg+xml";
      } else if (lowerFileName.endsWith(".bmp")) {
        mimeType = "image/bmp";
      }

      // Convert Uint8Array to Blob with proper MIME type
      const blob = new Blob([data], { type: mimeType });

      store.put({ fileName, blob });

      transaction.oncomplete = () => {
        db.close();
        resolve("stored");
      };

      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };

    request.onerror = () => reject(request.error);
  });
}

// Get media file URL from IndexedDB
export async function getMediaUrl(fileName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open("AnkiMedia", 1);

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("media")) {
        db.close();
        resolve(null);
        return;
      }

      const transaction = db.transaction(["media"], "readonly");
      const store = transaction.objectStore("media");
      const getRequest = store.get(fileName);

      getRequest.onsuccess = () => {
        const result = getRequest.result;
        db.close();

        if (result?.blob) {
          // Create a new object URL from the blob each time
          const url = URL.createObjectURL(result.blob);
          resolve(url);
        } else {
          console.log("No media found for:", fileName);
          resolve(null);
        }
      };

      getRequest.onerror = () => {
        db.close();
        resolve(null);
      };
    };

    request.onerror = () => resolve(null);
  });
}

let SQL: typeof initSqlJs | null = null;

async function initSQL() {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => {
        return `https://sql.js.org/dist/${file}`;
      },
    });
  }
  return SQL;
}

// Helper: Extract and store media files from ZIP
async function extractMediaFiles(zip: JSZip): Promise<void> {
  const mediaFile = zip.file("media");
  let mediaMapping: Record<string, string> = {};

  if (mediaFile) {
    const mediaJson = await mediaFile.async("text");
    mediaMapping = JSON.parse(mediaJson);
    console.log("Media mapping:", mediaMapping);
  }

  const mediaFiles = zip.file(/^[0-9]+$/);
  console.log("Found media files:", mediaFiles.length);

  for (const file of mediaFiles) {
    const mediaData = await file.async("uint8array");
    const mediaNumber = file.name;
    const actualFileName = mediaMapping[mediaNumber] || mediaNumber;

    await storeMediaFile(mediaNumber, mediaData);
    if (actualFileName !== mediaNumber) {
      await storeMediaFile(actualFileName, mediaData);
    }
    console.log("Stored media file:", mediaNumber, "→", actualFileName);
  }
}

// Helper: Load collection database from ZIP
async function loadCollectionDatabase(
  zip: JSZip,
  SQLModule: typeof initSqlJs,
): Promise<Database> {
  const collectionFile =
    zip.file("collection.anki21b") ||
    zip.file("collection.anki21") ||
    zip.file("collection.anki2");

  if (!collectionFile) {
    throw new Error("Invalid Anki package: no collection database found");
  }

  let collectionData: Uint8Array;
  const fileName = collectionFile.name;

  if (fileName === "collection.anki21b") {
    const compressedData = await collectionFile.async("uint8array");
    try {
      collectionData = decompress(compressedData);
    } catch (e) {
      throw new Error(
        "Failed to decompress collection.anki21b file. The file may be corrupted.",
      );
    }
  } else {
    collectionData = await collectionFile.async("uint8array");
  }

  return new SQLModule.Database(collectionData);
}

// Helper: Extract deck info from database
function extractDeckInfo(database: Database): { deckName: string; deckId: string | null } {
  try {
    const decksTableResult = database.exec("SELECT id, name FROM decks LIMIT 1");
    if (decksTableResult.length && decksTableResult[0].values.length) {
      return {
        deckName: decksTableResult[0].values[0][1] as string,
        deckId: String(decksTableResult[0].values[0][0]),
      };
    }
  } catch (e) {
    try {
      const decksResult = database.exec("SELECT decks FROM col");
      if (decksResult.length && decksResult[0].values.length) {
        const decksJson = JSON.parse(decksResult[0].values[0][0] as string);
        const firstDeckId = Object.keys(decksJson).find((id) => id !== "1");
        if (firstDeckId) {
          return {
            deckName: decksJson[firstDeckId].name,
            deckId: firstDeckId,
          };
        }
      }
    } catch (e2) {
      console.log("Could not parse deck info, using defaults");
    }
  }
  return { deckName: "Imported Deck", deckId: null };
}

// Helper: Extract notes from database
function extractNotes(database: Database): unknown[][] {
  try {
    const notesResult = database.exec("SELECT id, mid, flds, tags FROM notes");
    if (notesResult.length && notesResult[0].values.length) {
      return notesResult[0].values;
    }
  } catch (e) {
    console.error("Error with modern notes query:", e);
    try {
      const notesResult = database.exec("SELECT id, mid, flds FROM notes");
      if (notesResult.length && notesResult[0].values.length) {
        return notesResult[0].values;
      }
    } catch (e2) {
      console.error("Error with basic notes query:", e2);
    }
  }
  return [];
}

// Helper: Extract models from database
function extractModels(database: Database): Record<string, AnkiModel> {
  try {
    const modelsResult = database.exec("SELECT models FROM col");
    if (modelsResult.length && modelsResult[0].values.length) {
      const models = JSON.parse(modelsResult[0].values[0][0] as string);
      console.log("Loaded models:", Object.keys(models));
      return models;
    }
  } catch (e) {
    console.warn(
      "Could not load models, falling back to simple field mapping:",
      e,
    );
  }
  return {};
}

// Helper: Process HTML to extract text and media
function processHtml(html: string) {
  if (!html || typeof html !== "string") {
    return { text: "", audio: [], images: [] };
  }

  const audioMatches = html.match(/\[sound:([^\]]+)\]/g);
  const audioFiles = audioMatches
    ? (audioMatches
        .map((m) => m.match(/\[sound:([^\]]+)\]/)?.[1])
        .filter(Boolean) as string[])
    : [];

  const imgMatches = html.match(/<img[^>]+src=["']?([^"'>]+)["']?[^>]*>/gi);
  const imageFiles = imgMatches
    ? (imgMatches
        .map((m) => {
          const srcMatch = m.match(/src=["']?([^"'>]+)["']?/i);
          return srcMatch?.[1];
        })
        .filter(Boolean) as string[])
    : [];

  let cleaned = html
    .replace(/\[sound:([^\]]+)\]/g, "")
    .replace(/<img[^>]*>/gi, "");

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = cleaned;
  cleaned = tempDiv.textContent || tempDiv.innerText || "";
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return { text: cleaned, audio: audioFiles, images: imageFiles };
}

// Helper: Render Anki template (Mustache-like)
function renderTemplate(
  template: string,
  fieldMap: Record<string, string>,
): string {
  let rendered = template;

  const conditionalRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  rendered = rendered.replace(conditionalRegex, (match, fieldName, content) => {
    const fieldValue = fieldMap[fieldName] || "";
    return fieldValue.trim() ? content : "";
  });

  const invertedRegex = /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  rendered = rendered.replace(invertedRegex, (match, fieldName, content) => {
    const fieldValue = fieldMap[fieldName] || "";
    return fieldValue.trim() ? "" : content;
  });

  const fieldRegex = /\{\{(\w+)\}\}/g;
  rendered = rendered.replace(fieldRegex, (match, fieldName) => {
    return fieldMap[fieldName] || "";
  });

  return rendered;
}

// Helper: Process a note with fallback (no model)
async function processNoteWithFallback(
  noteId: string,
  fieldValues: string[],
  deckId: string,
  importBatchId: string,
  processHtmlFn: typeof processHtml,
): Promise<void> {
  const processedFields = fieldValues.map((f) => processHtmlFn(f));
  const frontData = processedFields[0] || { text: "", audio: [], images: [] };
  const backData = processedFields[1] ||
    processedFields[0] || { text: "", audio: [], images: [] };

  // Create mapping for this card (note -> card in Anki terminology)
  const cardId = await ImportMappingService.getOrCreateMapping(
    "anki",
    noteId,
    "card",
    importBatchId,
  );

  // Create card with external ID tracking
  const card = await db.srsEngine.createCard(
    frontData.text || "No content",
    backData.text || frontData.text || "No content",
    deckId,
  );

  card.id = cardId;
  card.importSource = "anki";
  card.externalId = noteId;
  if (frontData.audio[0]) card.frontAudio = frontData.audio[0];
  if (backData.audio[0]) card.backAudio = backData.audio[0];
  if (frontData.images[0]) card.frontImage = frontData.images[0];
  if (backData.images[0]) card.backImage = backData.images[0];

  await db.cards.add(card);
}

// Helper: Process a note with model templates
async function processNoteWithModel(
  noteId: string,
  fieldValues: string[],
  model: AnkiModel,
  deckId: string,
  importBatchId: string,
  cardDirection: CardDirection,
  processHtmlFn: typeof processHtml,
  renderTemplateFn: typeof renderTemplate,
): Promise<number> {
  const fieldMap: Record<string, string> = {};
  const modelFields = model.flds || [];

  modelFields.forEach((field: AnkiField, index: number) => {
    fieldMap[field.name] = fieldValues[index] || "";
  });

  console.log("Field map:", fieldMap);

  const templates = model.tmpls || [];
  const filteredTemplates = templates.filter((template, index) => {
    if (cardDirection === "all") return true;
    if (cardDirection === "forward") return index === 0;
    if (cardDirection === "reverse") return index === 1;
    return true;
  });

  let cardsCreated = 0;

  for (let templateIndex = 0; templateIndex < filteredTemplates.length; templateIndex++) {
    const template = filteredTemplates[templateIndex];
    const qfmt = template.qfmt || "";
    const afmt = template.afmt || "";

    console.log(`\n--- Template: ${template.name || "Card"} ---`);

    const renderedFront = renderTemplateFn(qfmt, fieldMap);
    const fieldMapWithFront = { ...fieldMap, FrontSide: renderedFront };
    const renderedBack = renderTemplateFn(afmt, fieldMapWithFront);

    const frontData = processHtmlFn(renderedFront);
    const backData = processHtmlFn(renderedBack);

    if (
      !frontData.text.trim() &&
      !frontData.images.length &&
      !backData.text.trim()
    ) {
      console.log("Skipping empty card");
      continue;
    }

    // Create unique ID for this card (note + template combination)
    const cardExternalId = `${noteId}_${templateIndex}`;
    const cardId = await ImportMappingService.getOrCreateMapping(
      "anki",
      cardExternalId,
      "card",
      importBatchId,
    );

    // Create card with external ID tracking
    const card = await db.srsEngine.createCard(
      frontData.text || "(image only)",
      backData.text || frontData.text || "(image only)",
      deckId,
    );

    card.id = cardId;
    card.importSource = "anki";
    card.externalId = cardExternalId;
    if (frontData.audio[0]) card.frontAudio = frontData.audio[0];
    if (backData.audio[0]) card.backAudio = backData.audio[0];
    if (frontData.images[0]) card.frontImage = frontData.images[0];
    if (backData.images[0]) card.backImage = backData.images[0];

    await db.cards.add(card);
    cardsCreated++;
  }

  return cardsCreated;
}

export async function importAnkiDeck(
  file: File,
  cardDirection: CardDirection = "all",
): Promise<AnkiImportResult> {
  let importBatchId: string | null = null;

  try {
    const SQLModule = await initSQL();
    const zip = await JSZip.loadAsync(file);

    // Extract media files
    await extractMediaFiles(zip);

    // Load database
    const database = await loadCollectionDatabase(zip, SQLModule);

    // Extract data from database
    const { deckName, deckId: ankiDeckId } = extractDeckInfo(database);
    const notes = extractNotes(database);
    const modelsData = extractModels(database);

    if (notes.length === 0) {
      throw new Error(
        "No notes found in the deck. The deck may be empty or in an unsupported format.",
      );
    }

    // Check if this deck was previously imported
    const existingBatchId = ankiDeckId
      ? await ImportMappingService.getDeckImportBatch("anki", ankiDeckId)
      : null;
    const isReimport = !!existingBatchId;

    if (isReimport) {
      console.log(`🔄 Re-importing previously imported deck (batch: ${existingBatchId})`);
    }

    // Create import batch
    importBatchId = await ImportMappingService.createImportBatch(
      "anki",
      file.name,
      { deckName, ankiDeckId, isReimport },
    );

    // Get or create deck mapping
    let newDeckId: string;
    if (ankiDeckId) {
      newDeckId = await ImportMappingService.getOrCreateMapping(
        "anki",
        ankiDeckId,
        "deck",
        importBatchId,
      );

      // Check if deck already exists
      const existingDeck = await db.getDeck(newDeckId);
      if (!existingDeck) {
        // Create new deck
        const deck = {
          id: newDeckId,
          name: deckName,
          description: `Imported from Anki (${notes.length} notes)`,
          cardCount: 0,
          dueCount: 0,
          newCount: 0,
          importSource: "anki" as const,
          externalId: ankiDeckId,
        };
        await db.decks.add(deck);
      } else if (isReimport) {
        // Update existing deck name if changed
        await db.decks.update(newDeckId, {
          name: deckName,
          description: `Re-imported from Anki (${notes.length} notes)`,
        });
      }
    } else {
      // No Anki deck ID found, create new deck without mapping
      newDeckId = await db.createDeck(
        deckName,
        `Imported from Anki (${notes.length} notes)`,
      );
    }

    let totalCardsCreated = 0;

    for (const note of notes) {
      const noteId = String(note[0]);
      const modelId = String(note[1]);
      const fieldsData = note[2] as string;

      if (!fieldsData) continue;

      const fieldValues = fieldsData.split("\x1f");
      const model = modelsData[modelId];

      console.log("=== NOTE DEBUG ===");
      console.log("Note ID:", noteId, "| Model ID:", modelId);

      if (!model) {
        console.warn(`Model ${modelId} not found, using fallback`);
        await processNoteWithFallback(
          noteId,
          fieldValues,
          newDeckId,
          importBatchId,
          processHtml,
        );
        totalCardsCreated++;
      } else {
        const cardsCreated = await processNoteWithModel(
          noteId,
          fieldValues,
          model,
          newDeckId,
          importBatchId,
          cardDirection,
          processHtml,
          renderTemplate,
        );
        totalCardsCreated += cardsCreated;
      }
    }

    console.log(
      `\n✅ Created ${totalCardsCreated} cards from ${notes.length} notes`,
    );

    await db.updateDeckStats(newDeckId);
    database.close();

    // Mark import batch as completed
    await ImportMappingService.completeImportBatch(importBatchId, {
      notesImported: notes.length,
      cardsImported: totalCardsCreated,
      decksImported: 1,
    });

    return {
      deckName,
      cardCount: totalCardsCreated,
      deckId: newDeckId,
      isReimport,
      importBatchId,
    };
  } catch (error) {
    console.error("Error importing Anki deck:", error);

    // Mark import batch as failed
    if (importBatchId) {
      await ImportMappingService.failImportBatch(importBatchId);
    }

    throw new Error(
      `Failed to import Anki deck: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
