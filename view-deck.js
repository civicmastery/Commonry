import pool from "./db.js";

async function viewDeck(deckId) {
  try {
    const deck = await pool.query("SELECT * FROM decks WHERE deck_id = $1", [
      deckId,
    ]);
    console.log("\n📚 DECK:", deck.rows[0].name);
    console.log("Description:", deck.rows[0].description);

    const cards = await pool.query(
      `
      SELECT card_id, front_content, back_content, tags 
      FROM cards 
      WHERE deck_id = $1 
      LIMIT 10
    `,
      [deckId],
    );

    console.log(`\n🃏 CARDS (showing first 10 of ${cards.rowCount}):\n`);
    cards.rows.forEach((card, i) => {
      console.log(`--- Card ${i + 1} ---`);
      console.log(`Front: ${card.front_content.html}`);
      console.log(`Back: ${card.back_content.html}`);
      console.log(`Tags: ${card.tags.join(", ") || "none"}`);
      console.log("");
    });
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await pool.end();
  }
}

// Usage: node view-deck.js <deck-id>
const deckId = process.argv[2] || "6f0b544f-ba7f-4d68-8d2e-43877c5c6f47";
viewDeck(deckId);
