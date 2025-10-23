// src/lib/anki-export.ts
import JSZip from "jszip";
import initSqlJs, { Database } from "sql.js";
import { db } from "../storage/database";
import { ImportMappingService } from "../services/import-mapping-service";
import type { Card, Deck } from "./srs-engine";
import type { DeckId } from "../types/ids";

export interface AnkiExportResult {
  fileName: string;
  blob: Blob;
  cardCount: number;
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

/**
 * Export a Commonry deck to Anki .apkg format
 * If the deck was imported from Anki, original IDs will be restored
 */
export async function exportAnkiDeck(
  deckId: DeckId,
): Promise<AnkiExportResult> {
  try {
    const SQLModule = await initSQL();

    // Get deck and cards
    const deck = await db.getDeck(deckId);
    if (!deck) {
      throw new Error("Deck not found");
    }

    const cards = await db.cards.where("deckId").equals(deckId).toArray();
    if (cards.length === 0) {
      throw new Error("Deck has no cards to export");
    }

    // Create a new SQLite database for Anki
    const database = new SQLModule.Database();

    // Initialize Anki database schema
    initializeAnkiSchema(database, deck);

    // Get or create deck ID for Anki
    const ankiDeckId = deck.externalId
      ? deck.externalId
      : String(Date.now());

    // Insert deck
    insertDeck(database, ankiDeckId, deck.name);

    // Create a basic model (note type)
    const modelId = String(Date.now());
    insertBasicModel(database, modelId);

    // Insert notes and cards
    let cardCount = 0;
    for (const card of cards) {
      const noteId = card.externalId
        ? card.externalId.split("_")[0] // Extract note ID from card external ID
        : String(Date.now() + cardCount);

      insertNote(database, noteId, modelId, card, ankiDeckId);
      insertCard(database, String(Date.now() + cardCount), noteId, ankiDeckId);
      cardCount++;
    }

    // Export database to Uint8Array
    const data = database.export();

    // Create ZIP file
    const zip = new JSZip();
    zip.file("collection.anki2", data);

    // Add media mapping (empty for now - could be enhanced to include actual media files)
    const mediaMapping: Record<string, string> = {};
    zip.file("media", JSON.stringify(mediaMapping));

    // Generate ZIP blob
    const blob = await zip.generateAsync({ type: "blob" });

    database.close();

    const fileName = `${sanitizeFileName(deck.name)}.apkg`;

    return {
      fileName,
      blob,
      cardCount: cards.length,
    };
  } catch (error) {
    console.error("Error exporting Anki deck:", error);
    throw new Error(
      `Failed to export Anki deck: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Initialize basic Anki database schema
 */
function initializeAnkiSchema(database: Database, deck: Deck): void {
  // Create col table (collection metadata)
  database.run(`
    CREATE TABLE col (
      id INTEGER PRIMARY KEY,
      crt INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      scm INTEGER NOT NULL,
      ver INTEGER NOT NULL,
      dty INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      ls INTEGER NOT NULL,
      conf TEXT NOT NULL,
      models TEXT NOT NULL,
      decks TEXT NOT NULL,
      dconf TEXT NOT NULL,
      tags TEXT NOT NULL
    )
  `);

  // Create notes table
  database.run(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY,
      guid TEXT NOT NULL,
      mid INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      tags TEXT NOT NULL,
      flds TEXT NOT NULL,
      sfld TEXT NOT NULL,
      csum INTEGER NOT NULL,
      flags INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);

  // Create cards table
  database.run(`
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY,
      nid INTEGER NOT NULL,
      did INTEGER NOT NULL,
      ord INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      type INTEGER NOT NULL,
      queue INTEGER NOT NULL,
      due INTEGER NOT NULL,
      ivl INTEGER NOT NULL,
      factor INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      left INTEGER NOT NULL,
      odue INTEGER NOT NULL,
      odid INTEGER NOT NULL,
      flags INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);

  // Create graves table (for sync)
  database.run(`
    CREATE TABLE graves (
      usn INTEGER NOT NULL,
      oid INTEGER NOT NULL,
      type INTEGER NOT NULL
    )
  `);

  const now = Math.floor(Date.now() / 1000);

  // Insert collection metadata
  const colData = {
    id: 1,
    crt: now,
    mod: now,
    scm: now,
    ver: 11,
    dty: 0,
    usn: 0,
    ls: 0,
    conf: JSON.stringify({}),
    models: JSON.stringify({}),
    decks: JSON.stringify({}),
    dconf: JSON.stringify({}),
    tags: JSON.stringify({}),
  };

  database.run(
    `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      colData.id,
      colData.crt,
      colData.mod,
      colData.scm,
      colData.ver,
      colData.dty,
      colData.usn,
      colData.ls,
      colData.conf,
      colData.models,
      colData.decks,
      colData.dconf,
      colData.tags,
    ],
  );
}

/**
 * Insert deck into Anki database
 */
function insertDeck(database: Database, deckId: string, deckName: string): void {
  const now = Math.floor(Date.now() / 1000);

  // Get existing decks JSON
  const result = database.exec("SELECT decks FROM col");
  const decksJson = result[0].values[0][0] as string;
  const decks = JSON.parse(decksJson);

  // Add new deck
  decks[deckId] = {
    id: parseInt(deckId),
    name: deckName,
    mod: now,
    usn: 0,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    desc: "",
    dyn: 0,
    conf: 1,
  };

  // Update col table
  database.run("UPDATE col SET decks = ? WHERE id = 1", [JSON.stringify(decks)]);
}

/**
 * Insert basic model (note type) into Anki database
 */
function insertBasicModel(database: Database, modelId: string): void {
  const now = Math.floor(Date.now() / 1000);

  // Get existing models JSON
  const result = database.exec("SELECT models FROM col");
  const modelsJson = result[0].values[0][0] as string;
  const models = JSON.parse(modelsJson);

  // Add basic model
  models[modelId] = {
    id: parseInt(modelId),
    name: "Basic",
    type: 0,
    mod: now,
    usn: 0,
    sortf: 0,
    did: null,
    tmpls: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Front}}",
        afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        bqfmt: "",
        bafmt: "",
        did: null,
      },
    ],
    flds: [
      {
        name: "Front",
        ord: 0,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
      },
      {
        name: "Back",
        ord: 1,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
      },
    ],
    css: ".card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n",
    latexPre:
      "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}",
    latexsvg: false,
    req: [[0, "any", [0]]],
  };

  // Update col table
  database.run("UPDATE col SET models = ? WHERE id = 1", [JSON.stringify(models)]);
}

/**
 * Insert note into Anki database
 */
function insertNote(
  database: Database,
  noteId: string,
  modelId: string,
  card: Card,
  deckId: string,
): void {
  const now = Math.floor(Date.now() / 1000);

  // Combine fields with Anki field separator
  const fields = [card.front, card.back].join("\x1f");

  database.run(
    `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parseInt(noteId),
      generateGUID(),
      parseInt(modelId),
      now,
      0,
      "",
      fields,
      card.front.substring(0, 64), // sfld is first field truncated
      0,
      0,
      "",
    ],
  );
}

/**
 * Insert card into Anki database
 */
function insertCard(
  database: Database,
  cardId: string,
  noteId: string,
  deckId: string,
): void {
  const now = Math.floor(Date.now() / 1000);

  database.run(
    `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parseInt(cardId),
      parseInt(noteId),
      parseInt(deckId),
      0, // ord (template ordinal)
      now,
      0, // usn
      0, // type (0 = new)
      0, // queue (0 = new)
      0, // due
      0, // interval
      2500, // factor (2.5 = 250%)
      0, // reps
      0, // lapses
      0, // left
      0, // odue
      0, // odid
      0, // flags
      "", // data
    ],
  );
}

/**
 * Generate a GUID for Anki note
 */
function generateGUID(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Sanitize filename for safe download
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-z0-9_\- ]/gi, "_")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}
