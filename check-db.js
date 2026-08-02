import pool from "./db.js";
import dotenv from "dotenv";

dotenv.config();

async function checkDatabase() {
  try {
    console.log("Checking users table structure...");

    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log("\nUsers table columns:");
    result.rows.forEach((row) => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

    process.exitCode = 0;
    return;
  } catch (error) {
    console.error("Error:", error);
    throw new Error("Database check failed", { cause: error });
  }
}

checkDatabase();
