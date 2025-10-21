import pool from "./db.js";

async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✓ Connected to database!");
    console.log("Current time:", result.rows[0].now);
  } catch (err) {
    console.error("✗ Connection error:", err.message);
  } finally {
    await pool.end();
  }
}

testConnection();
