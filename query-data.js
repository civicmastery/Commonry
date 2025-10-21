import pool from "./db.js";

async function queryData() {
  try {
    // Get all decks
    const decks = await pool.query("SELECT * FROM decks");
    console.log("\n DECKS:");
    console.log(decks.rows);

    // Get all cards with deck info
    const cards = await pool.query(`
      SELECT c.card_id, d.name as deck_name, c.front_content, c.back_content, c.tags
      FROM cards c
      JOIN decks d ON c.deck_id = d.deck_id
    `);
    console.log("\n CARDS:");
    cards.rows.forEach((card) => {
      console.log(`\nDeck: ${card.deck_name}`);
      console.log(`Front: ${card.front_content.html}`);
      console.log(`Back: ${card.back_content.html}`);
      console.log(`Tags: ${card.tags.join(", ")}`);
    });
  } catch (error) {
    console.error("✗ Error querying data:", error.message);
  } finally {
    await pool.end();
  }
}

queryData();
