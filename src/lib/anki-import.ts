// src/lib/anki-import.ts
import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import { decompress } from 'fzstd';
import { db } from '../storage/database';

export interface AnkiImportResult {
  deckName: string;
  cardCount: number;
  deckId: string;
}

export type CardDirection = 'all' | 'forward' | 'reverse';

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
async function storeMediaFile(fileName: string, data: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AnkiMedia', 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'fileName' });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction(['media'], 'readwrite');
      const store = transaction.objectStore('media');

      // Determine MIME type based on file extension
      let mimeType = 'application/octet-stream';
      const lowerFileName = fileName.toLowerCase();

      // Audio types
      if (lowerFileName.endsWith('.mp3')) {
        mimeType = 'audio/mpeg';
      } else if (lowerFileName.endsWith('.wav')) {
        mimeType = 'audio/wav';
      } else if (lowerFileName.endsWith('.ogg')) {
        mimeType = 'audio/ogg';
      }
      // Image types
      else if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (lowerFileName.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (lowerFileName.endsWith('.gif')) {
        mimeType = 'image/gif';
      } else if (lowerFileName.endsWith('.webp')) {
        mimeType = 'image/webp';
      } else if (lowerFileName.endsWith('.svg')) {
        mimeType = 'image/svg+xml';
      } else if (lowerFileName.endsWith('.bmp')) {
        mimeType = 'image/bmp';
      }

      // Convert Uint8Array to Blob with proper MIME type
      const blob = new Blob([data], { type: mimeType });

      store.put({ fileName, blob });

      transaction.oncomplete = () => {
        db.close();
        resolve('stored');
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
    const request = indexedDB.open('AnkiMedia', 1);

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('media')) {
        db.close();
        resolve(null);
        return;
      }

      const transaction = db.transaction(['media'], 'readonly');
      const store = transaction.objectStore('media');
      const getRequest = store.get(fileName);

      getRequest.onsuccess = () => {
        const result = getRequest.result;
        db.close();

        if (result?.blob) {
          // Create a new object URL from the blob each time
          const url = URL.createObjectURL(result.blob);
          resolve(url);
        } else {
          console.log('No media found for:', fileName);
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
      }
    });
  }
  return SQL;
}

export async function importAnkiDeck(file: File, cardDirection: CardDirection = 'all'): Promise<AnkiImportResult> {
  try {
    // Initialize SQL.js
    const SQLModule = await initSQL();

    // Read the .apkg file (it's a ZIP archive)
    const zip = await JSZip.loadAsync(file);

    // Check for media mapping file
    const mediaFile = zip.file('media');
    let mediaMapping: Record<string, string> = {};

    if (mediaFile) {
      const mediaJson = await mediaFile.async('text');
      mediaMapping = JSON.parse(mediaJson);
      console.log('Media mapping:', mediaMapping);
    }

    // Extract and store media files
    const mediaFiles = zip.file(/^[0-9]+$/); // Media files are named with numbers
    console.log('Found media files:', mediaFiles.length);

    for (const mediaFile of mediaFiles) {
      const mediaData = await mediaFile.async('uint8array');
      const mediaNumber = mediaFile.name;
      const actualFileName = mediaMapping[mediaNumber] || mediaNumber;

      // Store the media file with both the number and actual filename
      await storeMediaFile(mediaNumber, mediaData);
      if (actualFileName !== mediaNumber) {
        await storeMediaFile(actualFileName, mediaData);
      }
      console.log('Stored media file:', mediaNumber, '→', actualFileName);
    }

    // Try to find the database file in order of preference
    const collectionFile = zip.file('collection.anki21b') ||
                        zip.file('collection.anki21') ||
                        zip.file('collection.anki2');

    if (!collectionFile) {
      throw new Error('Invalid Anki package: no collection database found');
    }

    let collectionData: Uint8Array;
    const fileName = collectionFile.name;

    // Handle zstd compression for .anki21b files
    if (fileName === 'collection.anki21b') {
      const compressedData = await collectionFile.async('uint8array');
      try {
        collectionData = decompress(compressedData);
      } catch (e) {
        throw new Error('Failed to decompress collection.anki21b file. The file may be corrupted.');
      }
    } else {
      collectionData = await collectionFile.async('uint8array');
    }

    const database: Database = new SQLModule.Database(collectionData);

    // List all tables to debug
    const tablesResult = database.exec("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Available tables:', tablesResult);

    // Try to get deck information
    let deckName = 'Imported Deck';

    try {
      // Try modern format with decks table
      const decksTableResult = database.exec('SELECT name FROM decks LIMIT 1');
      if (decksTableResult.length && decksTableResult[0].values.length) {
        deckName = decksTableResult[0].values[0][0] as string;
      }
    } catch (e) {
      try {
        // Fallback to col table
        const decksResult = database.exec('SELECT decks FROM col');
        if (decksResult.length && decksResult[0].values.length) {
          const decksJson = JSON.parse(decksResult[0].values[0][0] as string);
          const firstDeckId = Object.keys(decksJson).find(id => id !== '1');
          deckName = firstDeckId ? decksJson[firstDeckId].name : 'Imported Deck';
        }
      } catch (e2) {
        console.log('Could not parse deck name, using default');
      }
    }

    // Get notes
    let notes: unknown[][] = [];

    try {
      // Modern schema: SELECT id, mid, flds, tags FROM notes
      const notesResult = database.exec('SELECT id, mid, flds, tags FROM notes');
      if (notesResult.length && notesResult[0].values.length) {
        notes = notesResult[0].values;
      }
    } catch (e) {
      console.error('Error with modern notes query:', e);

      // Try without tags column for older schema
      try {
        const notesResult = database.exec('SELECT id, mid, flds FROM notes');
        if (notesResult.length && notesResult[0].values.length) {
          notes = notesResult[0].values;
        }
      } catch (e2) {
        console.error('Error with basic notes query:', e2);
      }
    }

    if (notes.length === 0) {
      throw new Error('No notes found in the deck. The deck may be empty or in an unsupported format.');
    }

    // ====== QUERY MODELS (NOTE TYPES) FROM DATABASE ======
    let modelsData: Record<string, AnkiModel> = {};

    try {
      const modelsResult = database.exec('SELECT models FROM col');
      if (modelsResult.length && modelsResult[0].values.length) {
        modelsData = JSON.parse(modelsResult[0].values[0][0] as string);
        console.log('Loaded models:', Object.keys(modelsData));
      }
    } catch (e) {
      console.warn('Could not load models, falling back to simple field mapping:', e);
    }

    // ====== HELPER: EXTRACT MEDIA AND TEXT FROM HTML ======
    const processHtml = (html: string) => {
      if (!html || typeof html !== 'string') {
        return { text: '', audio: [], images: [] };
      }

      // Extract audio files like [sound:filename.mp3]
      const audioMatches = html.match(/\[sound:([^\]]+)\]/g);
      const audioFiles = audioMatches ? audioMatches.map(m => m.match(/\[sound:([^\]]+)\]/)?.[1]).filter(Boolean) as string[] : [];

      // Extract image files from <img src="filename.jpg"> tags
      const imgMatches = html.match(/<img[^>]+src=["']?([^"'>]+)["']?[^>]*>/gi);
      const imageFiles = imgMatches ? imgMatches.map(m => {
        const srcMatch = m.match(/src=["']?([^"'>]+)["']?/i);
        return srcMatch?.[1];
      }).filter(Boolean) as string[] : [];

      // Remove audio and image tags from display text
      let cleaned = html
        .replace(/\[sound:([^\]]+)\]/g, '')
        .replace(/<img[^>]*>/gi, '');

      // Strip HTML tags but preserve content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleaned;
      cleaned = tempDiv.textContent || tempDiv.innerText || '';

      // Clean up extra whitespace
      cleaned = cleaned.replace(/\s+/g, ' ').trim();

      return { text: cleaned, audio: audioFiles, images: imageFiles };
    };

    // ====== HELPER: RENDER ANKI TEMPLATE (Mustache-like) ======
    const renderTemplate = (template: string, fieldMap: Record<string, string>): string => {
      let rendered = template;

      // Handle conditional sections {{#FieldName}}...{{/FieldName}}
      // If field is empty, remove the entire section
      const conditionalRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
      rendered = rendered.replace(conditionalRegex, (match, fieldName, content) => {
        const fieldValue = fieldMap[fieldName] || '';
        return fieldValue.trim() ? content : '';
      });

      // Handle inverted conditional sections {{^FieldName}}...{{/FieldName}}
      // Show content only if field is empty
      const invertedRegex = /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
      rendered = rendered.replace(invertedRegex, (match, fieldName, content) => {
        const fieldValue = fieldMap[fieldName] || '';
        return fieldValue.trim() ? '' : content;
      });

      // Handle simple field substitutions {{FieldName}}
      const fieldRegex = /\{\{(\w+)\}\}/g;
      rendered = rendered.replace(fieldRegex, (match, fieldName) => {
        return fieldMap[fieldName] || '';
      });

      return rendered;
    };

    // Create a new deck in our database
    const newDeckId = await db.createDeck(deckName, `Imported from Anki (${notes.length} notes)`);
    let totalCardsCreated = 0;

    // ====== IMPORT CARDS USING TEMPLATES ======
    for (const note of notes) {
      const noteId = note[0] as number;
      const modelId = String(note[1]); // Convert to string for lookup
      const fieldsData = note[2] as string;

      if (!fieldsData) continue;

      const fieldValues = fieldsData.split('\x1f'); // Fields separated by \x1f
      const model = modelsData[modelId];

      console.log('=== NOTE DEBUG ===');
      console.log('Note ID:', noteId, '| Model ID:', modelId);
      console.log('Field values:', fieldValues);

      // FALLBACK: If no model found, use simple field mapping
      if (!model) {
        console.warn(`Model ${modelId} not found, using fallback`);

        const processedFields = fieldValues.map(f => processHtml(f));
        let frontData = processedFields[0] || { text: '', audio: [], images: [] };
        const backData = processedFields[1] || processedFields[0] || { text: '', audio: [], images: [] };

        await db.createCard(
          frontData.text || 'No content',
          backData.text || frontData.text || 'No content',
          newDeckId,
          frontData.audio[0],
          backData.audio[0],
          frontData.images[0],
          backData.images[0]
        );
        totalCardsCreated++;
        continue;
      }

      // BUILD FIELD NAME → VALUE MAP
      const fieldMap: Record<string, string> = {};
      const modelFields = model.flds || [];

      modelFields.forEach((field: AnkiField, index: number) => {
        const fieldName = field.name;
        const fieldValue = fieldValues[index] || '';
        fieldMap[fieldName] = fieldValue;
      });

      console.log('Field map:', fieldMap);

      // GENERATE CARDS FROM TEMPLATES
      const templates = model.tmpls || [];

      // Filter templates based on user's card direction choice
      const filteredTemplates = templates.filter((template, index) => {
        if (cardDirection === 'all') return true;
        if (cardDirection === 'forward') return index === 0; // First template only
        if (cardDirection === 'reverse') return index === 1; // Second template only (if exists)
        return true;
      });

      for (const template of filteredTemplates) {
        const templateName = template.name || 'Card';
        const qfmt = template.qfmt || ''; // Question format (front)
        const afmt = template.afmt || ''; // Answer format (back)

        console.log(`\n--- Template: ${templateName} ---`);
        console.log('Question format:', qfmt.substring(0, 200));
        console.log('Answer format:', afmt.substring(0, 200));

        // Render front template
        const renderedFront = renderTemplate(qfmt, fieldMap);

        // Render back template with FrontSide support
        // {{FrontSide}} is a special Anki variable that includes the rendered front
        const fieldMapWithFront = { ...fieldMap, FrontSide: renderedFront };
        const renderedBack = renderTemplate(afmt, fieldMapWithFront);

        console.log('Rendered front HTML:', renderedFront.substring(0, 200));
        console.log('Rendered back HTML:', renderedBack.substring(0, 200));

        // Process rendered HTML to extract text and media
        const frontData = processHtml(renderedFront);
        const backData = processHtml(renderedBack);

        // Skip card if both front and back are empty
        if (!frontData.text.trim() && !frontData.images.length && !backData.text.trim()) {
          console.log('Skipping empty card');
          continue;
        }

        console.log('Final front text:', frontData.text);
        console.log('Front media - audio:', frontData.audio, '| images:', frontData.images);
        console.log('Final back text:', backData.text);
        console.log('Back media - audio:', backData.audio, '| images:', backData.images);

        // Create card
        await db.createCard(
          frontData.text || '(image only)',
          backData.text || frontData.text || '(image only)',
          newDeckId,
          frontData.audio[0],
          backData.audio[0],
          frontData.images[0],
          backData.images[0]
        );

        totalCardsCreated++;
      }
    }

    console.log(`\n✅ Created ${totalCardsCreated} cards from ${notes.length} notes`);

    // Update deck stats
    await db.updateDeckStats(newDeckId);

    // Clean up
    database.close();

    return {
      deckName,
      cardCount: totalCardsCreated,
      deckId: newDeckId
    };
  } catch (error) {
    console.error('Error importing Anki deck:', error);
    throw new Error(`Failed to import Anki deck: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
