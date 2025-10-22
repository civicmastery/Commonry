import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import pool from "./db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

// Rate limiter for deck import endpoint
const importLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per minute
  message: { error: "Too many import requests. Please try again later." }
});

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

app.use(express.json());

// Upload and import Anki deck
app.post("/api/decks/import", importLimiter, upload.single("deck"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const client = await pool.connect();

  try {
    const zip = new AdmZip(req.file.path);
    const tempDir = `uploads/temp_${Date.now()}`;
    zip.extractAllTo(tempDir, true);

    // Open Anki's SQLite database (try different versions)
    let collectionPath = path.join(tempDir, "collection.anki21");
    if (!fs.existsSync(collectionPath)) {
      collectionPath = path.join(tempDir, "collection.anki21b");
    }
    if (!fs.existsSync(collectionPath)) {
      collectionPath = path.join(tempDir, "collection.anki2");
    }
    if (!fs.existsSync(collectionPath)) {
      throw new Error("Invalid .apkg file: no collection file found");
    }

    const ankiDb = new Database(collectionPath, { readonly: true });

    await client.query("BEGIN");

    // Get deck info from Anki
    const _decks = ankiDb.prepare("SELECT * FROM col").get();
    const deckName = req.body.deckName || "Imported Deck";

    // Create deck in our database
    const deckResult = await client.query(
      `
      INSERT INTO decks (name, description, metadata)
      VALUES ($1, $2, $3)
      RETURNING deck_id
    `,
      [deckName, "Imported from Anki", JSON.stringify({})],
    );

    const deckId = deckResult.rows[0].deck_id;

    // Get all notes (cards) from Anki
    const notes = ankiDb.prepare("SELECT * FROM notes").all();

    let cardCount = 0;
    for (const note of notes) {
      const fields = note.flds.split("\x1f"); // Anki uses \x1f as separator

      if (fields.length >= 2) {
        await client.query(
          `
          INSERT INTO cards (deck_id, card_type, front_content, back_content, tags)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [
            deckId,
            "basic",
            JSON.stringify({ html: fields[0], media: [] }),
            JSON.stringify({ html: fields[1], media: [] }),
            note.tags ? note.tags.split(" ") : [],
          ],
        );
        cardCount++;
      }
    }

    ankiDb.close();

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.unlinkSync(req.file.path);

    await client.query("COMMIT");

    return res.json({
      success: true,
      deckId,
      deckName,
      cardsImported: cardCount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Import error:", error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get all decks
app.get("/api/decks", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM decks ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get deck with cards
app.get("/api/decks/:id", async (req, res) => {
  try {
    const deck = await pool.query("SELECT * FROM decks WHERE deck_id = $1", [
      req.params.id,
    ]);
    const cards = await pool.query("SELECT * FROM cards WHERE deck_id = $1", [
      req.params.id,
    ]);

    res.json({
      deck: deck.rows[0],
      cards: cards.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
