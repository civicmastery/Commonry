// src/lib/anki-import.ts
import JSZip from "jszip";
import initSqlJs, { Database } from "sql.js";
import { decompress } from "fzstd";
import { db } from "../storage/database";

export interface AnkiImportResult {
  deckName: string;
  cardCount: number;
  deckId: string;
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

// Helper: Extract deck name from database
function extractDeckName(database: Database): string {
  try {
    const decksTableResult = database.exec("SELECT name FROM decks LIMIT 1");
    if (decksTableResult.length && decksTableResult[0].values.length) {
      return decksTableResult[0].values[0][0] as string;
    }
  } catch (e) {
    try {
      const decksResult = database.exec("SELECT decks FROM col");
      if (decksResult.length && decksResult[0].values.length) {
        const decksJson = JSON.parse(decksResult[0].values[0][0] as string);
        const firstDeckId = Object.keys(decksJson).find((id) => id !== "1");
        if (firstDeckId) {
          return decksJson[firstDeckId].name;
        }
      }
    } catch (e2) {
      console.log("Could not parse deck name, using default");
    }
  }
  return "Imported Deck";
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
  fieldValues: string[],
  deckId: string,
  processHtmlFn: typeof processHtml,
): Promise<void> {
  const processedFields = fieldValues.map((f) => processHtmlFn(f));
  const frontData = processedFields[0] || { text: "", audio: [], images: [] };
  const backData = processedFields[1] ||
    processedFields[0] || { text: "", audio: [], images: [] };

  await db.createCard(
    frontData.text || "No content",
    backData.text || frontData.text || "No content",
    deckId,
    frontData.audio[0],
    backData.audio[0],
    frontData.images[0],
    backData.images[0],
  );
}

// Helper: Process a note with model templates
async function processNoteWithModel(
  fieldValues: string[],
  model: AnkiModel,
  deckId: string,
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

  for (const template of filteredTemplates) {
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

    await db.createCard(
      frontData.text || "(image only)",
      backData.text || frontData.text || "(image only)",
      deckId,
      frontData.audio[0],
      backData.audio[0],
      frontData.images[0],
      backData.images[0],
    );

    cardsCreated++;
  }

  return cardsCreated;
}

export async function importAnkiDeck(
  file: File,
  cardDirection: CardDirection = "all",
): Promise<AnkiImportResult> {
  try {
    const SQLModule = await initSQL();
    const zip = await JSZip.loadAsync(file);

    // Extract media files
    await extractMediaFiles(zip);

    // Load database
    const database = await loadCollectionDatabase(zip, SQLModule);

    // Extract data from database
    const deckName = extractDeckName(database);
    const notes = extractNotes(database);
    const modelsData = extractModels(database);

    if (notes.length === 0) {
      throw new Error(
        "No notes found in the deck. The deck may be empty or in an unsupported format.",
      );
    }

    // Create deck and import cards
    const newDeckId = await db.createDeck(
      deckName,
      `Imported from Anki (${notes.length} notes)`,
    );
    let totalCardsCreated = 0;

    for (const note of notes) {
      const modelId = String(note[1]);
      const fieldsData = note[2] as string;

      if (!fieldsData) continue;

      const fieldValues = fieldsData.split("\x1f");
      const model = modelsData[modelId];

      console.log("=== NOTE DEBUG ===");
      console.log("Note ID:", note[0], "| Model ID:", modelId);

      if (!model) {
        console.warn(`Model ${modelId} not found, using fallback`);
        await processNoteWithFallback(fieldValues, newDeckId, processHtml);
        totalCardsCreated++;
      } else {
        const cardsCreated = await processNoteWithModel(
          fieldValues,
          model,
          newDeckId,
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

    return {
      deckName,
      cardCount: totalCardsCreated,
      deckId: newDeckId,
    };
  } catch (error) {
    console.error("Error importing Anki deck:", error);
    throw new Error(
      `Failed to import Anki deck: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
