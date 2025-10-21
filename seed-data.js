import pool from "./db.js";

async function seedTestData() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Create a test deck
    const deckResult = await client.query(
      `
      INSERT INTO decks (name, description, metadata)
      VALUES ($1, $2, $3)
      RETURNING deck_id
    `,
      [
        "Spanish Basics",
        "Common Spanish phrases for beginners",
        JSON.stringify({ difficulty: "beginner", language: "es" }),
      ],
    );

    const deckId = deckResult.rows[0].deck_id;
    console.log("✓ Created deck:", deckId);

    // Create test cards
    const cards = [
      {
        front: { html: "Hello", media: [] },
        back: { html: "Hola", media: [] },
        tags: ["greetings", "basic"],
      },
      {
        front: { html: "Goodbye", media: [] },
        back: { html: "Adiós", media: [] },
        tags: ["greetings", "basic"],
      },
      {
        front: { html: "Thank you", media: [] },
        back: { html: "Gracias", media: [] },
        tags: ["polite", "basic"],
      },
    ];

    for (const card of cards) {
      await client.query(
        `
        INSERT INTO cards (deck_id, card_type, front_content, back_content, tags)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [
          deckId,
          "basic",
          JSON.stringify(card.front),
          JSON.stringify(card.back),
          card.tags,
        ],
      );
    }

    console.log("✓ Created", cards.length, "cards");

    await client.query("COMMIT");
    console.log("✓ Test data seeded successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("✗ Error seeding data:", error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seedTestData();
