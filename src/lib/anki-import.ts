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
      if (fileName.toLowerCase().endsWith(".mp3")) {
        mimeType = "audio/mpeg";
      } else if (fileName.toLowerCase().endsWith(".wav")) {
        mimeType = "audio/wav";
      } else if (fileName.toLowerCase().endsWith(".ogg")) {
        mimeType = "audio/ogg";
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

let SQL: any = null;

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

export async function importAnkiDeck(file: File): Promise<AnkiImportResult> {
  try {
    // Initialize SQL.js
    const SQLModule = await initSQL();

    // Read the .apkg file (it's a ZIP archive)
    const zip = await JSZip.loadAsync(file);

    // Check for media mapping file
    const mediaFile = zip.file("media");
    let mediaMapping: Record<string, string> = {};

    if (mediaFile) {
      const mediaJson = await mediaFile.async("text");
      mediaMapping = JSON.parse(mediaJson);
      console.log("Media mapping:", mediaMapping);
    }

    // Extract and store media files
    const mediaFiles = zip.file(/^[0-9]+$/); // Media files are named with numbers
    console.log("Found media files:", mediaFiles.length);

    for (const mediaFile of mediaFiles) {
      const mediaData = await mediaFile.async("uint8array");
      const mediaNumber = mediaFile.name;
      const actualFileName = mediaMapping[mediaNumber] || mediaNumber;

      // Store the media file with both the number and actual filename
      await storeMediaFile(mediaNumber, mediaData);
      if (actualFileName !== mediaNumber) {
        await storeMediaFile(actualFileName, mediaData);
      }
      console.log("Stored media file:", mediaNumber, "→", actualFileName);
    }

    // Try to find the database file in order of preference
    let collectionFile =
      zip.file("collection.anki21b") ||
      zip.file("collection.anki21") ||
      zip.file("collection.anki2");

    if (!collectionFile) {
      throw new Error("Invalid Anki package: no collection database found");
    }

    let collectionData: Uint8Array;
    const fileName = collectionFile.name;

    // Handle zstd compression for .anki21b files
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

    const database: Database = new SQLModule.Database(collectionData);

    // List all tables to debug
    const tablesResult = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    console.log("Available tables:", tablesResult);

    // Try to get deck information
    let deckName = "Imported Deck";

    try {
      // Try modern format with decks table
      const decksTableResult = database.exec("SELECT name FROM decks LIMIT 1");
      if (decksTableResult.length && decksTableResult[0].values.length) {
        deckName = decksTableResult[0].values[0][0] as string;
      }
    } catch (e) {
      try {
        // Fallback to col table
        const decksResult = database.exec("SELECT decks FROM col");
        if (decksResult.length && decksResult[0].values.length) {
          const decksJson = JSON.parse(decksResult[0].values[0][0] as string);
          const firstDeckId = Object.keys(decksJson).find((id) => id !== "1");
          deckName = firstDeckId
            ? decksJson[firstDeckId].name
            : "Imported Deck";
        }
      } catch (e2) {
        console.log("Could not parse deck name, using default");
      }
    }

    // Get notes
    let notes: any[] = [];

    try {
      // Modern schema: SELECT id, mid, flds, tags FROM notes
      const notesResult = database.exec(
        "SELECT id, mid, flds, tags FROM notes",
      );
      if (notesResult.length && notesResult[0].values.length) {
        notes = notesResult[0].values;
      }
    } catch (e) {
      console.error("Error with modern notes query:", e);

      // Try without tags column for older schema
      try {
        const notesResult = database.exec("SELECT id, mid, flds FROM notes");
        if (notesResult.length && notesResult[0].values.length) {
          notes = notesResult[0].values;
        }
      } catch (e2) {
        console.error("Error with basic notes query:", e2);
      }
    }

    if (notes.length === 0) {
      throw new Error(
        "No notes found in the deck. The deck may be empty or in an unsupported format.",
      );
    }

    const cardCount = notes.length;

    // Create a new deck in our database
    const newDeckId = await db.createDeck(
      deckName,
      `Imported from Anki (${cardCount} cards)`,
    );

    // Import cards
    for (const note of notes) {
      // Fields are in the 3rd column (index 2)
      const fieldsData = note[2] as string;
      if (!fieldsData) continue;

      const fields = fieldsData.split("\x1f"); // Fields are separated by \x1f

      // Debug logging
      console.log("Raw fields data:", fieldsData);
      console.log("Split fields:", fields);
      console.log("Field count:", fields.length);

      // Extract audio references and strip HTML
      const processField = (html: string) => {
        // Extract audio files like [sound:filename.mp3]
        const audioMatches = html.match(/\[sound:([^\]]+)\]/g);
        const audioFiles = audioMatches
          ? audioMatches
              .map((m) => m.match(/\[sound:([^\]]+)\]/)?.[1])
              .filter(Boolean)
          : [];

        // Remove audio tags from display text
        let cleaned = html.replace(/\[sound:([^\]]+)\]/g, "");

        // Strip HTML tags and decode entities
        cleaned = cleaned
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        return { text: cleaned, audio: audioFiles };
      };

      // Process front
      const frontData = processField(fields[0] || "");
      const front = frontData.text || "No front content";
      const frontAudio = frontData.audio[0] || null; // Take first audio file for front

      // Combine all remaining fields for the back, filtering out empty ones
      let backParts: string[] = [];
      let backAudio: string | null = null;

      for (let i = 1; i < fields.length; i++) {
        const fieldData = processField(fields[i]);
        if (fieldData.text) {
          backParts.push(fieldData.text);
        }
        // Use first audio found in back fields
        if (!backAudio && fieldData.audio.length > 0) {
          backAudio = fieldData.audio[0];
        }
      }

      // If no back fields, use front as fallback
      const back =
        backParts.length > 0
          ? backParts.join("\n\n")
          : frontData.text || "No back content";

      console.log("Front:", front);
      console.log("Front audio:", frontAudio);
      console.log("Back:", back);
      console.log("Back audio:", backAudio);

      // Store card with audio info
      await db.createCard(
        front,
        back,
        newDeckId,
        frontAudio || undefined,
        backAudio || undefined,
      );
    }

    // Update deck stats
    await db.updateDeckStats(newDeckId);

    // Clean up
    database.close();

    return {
      deckName,
      cardCount,
      deckId: newDeckId,
    };
  } catch (error) {
    console.error("Error importing Anki deck:", error);
    throw new Error(
      `Failed to import Anki deck: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
