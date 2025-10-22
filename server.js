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
const UPLOADS_DIR = path.resolve(__dirname, "uploads");
const upload = multer({ dest: UPLOADS_DIR });

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

/**
 * Validate that a file path is within the uploads directory
 * Prevents path traversal attacks
 */
function isPathSafe(filePath, baseDir) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  return (
    resolvedPath.startsWith(resolvedBase + path.sep) ||
    resolvedPath === resolvedBase
  );
}

// General rate limiter: 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for file uploads: 5 uploads per 15 minutes per IP
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 upload requests per windowMs
  message: "Too many upload requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json());
app.use(generalLimiter);

// Upload and import Anki deck
app.post(
  "/api/decks/import",
  uploadLimiter,
  upload.single("deck"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Validate uploaded file path is within uploads directory
    if (!isPathSafe(req.file.path, UPLOADS_DIR)) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    const client = await pool.connect();
    const tempDir = path.join(UPLOADS_DIR, `temp_${Date.now()}`);
    let ankiDb = null;

    try {
      const zip = new AdmZip(req.file.path);
      zip.extractAllTo(tempDir, true);

      // Validate temp directory is within uploads directory
      if (!isPathSafe(tempDir, UPLOADS_DIR)) {
        throw new Error("Invalid temp directory path");
      }

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

      ankiDb = new Database(collectionPath, { readonly: true });

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
      // Close database connection if opened
      if (ankiDb) {
        try {
          ankiDb.close();
        } catch (e) {
          console.error("Error closing Anki database:", e);
        }
      }

      // Clean up temporary files - validate paths before deletion
      try {
        if (fs.existsSync(tempDir) && isPathSafe(tempDir, UPLOADS_DIR)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error("Error cleaning up temp directory:", e);
      }

      try {
        if (req.file?.path) {
          // Resolve and normalize the file path to prevent path traversal
          const uploadedFilePath = path.resolve(req.file.path);

          // Verify the resolved path is within the uploads directory
          if (
            fs.existsSync(uploadedFilePath) &&
            isPathSafe(uploadedFilePath, UPLOADS_DIR)
          ) {
            fs.unlinkSync(uploadedFilePath);
          }
        }
      } catch (e) {
        console.error("Error cleaning up uploaded file:", e);
      }

      client.release();
    }
  },
);

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
