import pool from "./db.js";
import { ulid } from "ulid";
import dotenv from "dotenv";

dotenv.config();

async function addSampleStats() {
  try {
    // Get the user ID (moonlitmountains)
    const userResult = await pool.query(
      "SELECT user_id FROM users WHERE username = 'moonlitmountains'",
    );

    if (userResult.rows.length === 0) {
      console.error("User not found!");
      throw new Error("User not found!");
    }

    const userId = userResult.rows[0].user_id;
    console.log(`Adding sample statistics for user: ${userId}`);

    // Create sample statistics record
    const statId = `stat_${ulid()}`;
    const today = new Date();
    const lastStudyDate = new Date(today);
    lastStudyDate.setDate(today.getDate() - 1); // Studied yesterday

    await pool.query(
      `INSERT INTO user_statistics (
        stat_id, user_id, current_streak, longest_streak, last_study_date,
        total_study_days, total_cards_reviewed, total_cards_mastered,
        active_decks_count, new_cards_this_week, new_cards_this_month,
        total_study_time_ms, average_session_time_ms, top_subjects,
        opted_into_leaderboard
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (user_id) DO UPDATE SET
        current_streak = EXCLUDED.current_streak,
        longest_streak = EXCLUDED.longest_streak,
        last_study_date = EXCLUDED.last_study_date,
        total_study_days = EXCLUDED.total_study_days,
        total_cards_reviewed = EXCLUDED.total_cards_reviewed,
        total_cards_mastered = EXCLUDED.total_cards_mastered,
        active_decks_count = EXCLUDED.active_decks_count,
        new_cards_this_week = EXCLUDED.new_cards_this_week,
        new_cards_this_month = EXCLUDED.new_cards_this_month,
        total_study_time_ms = EXCLUDED.total_study_time_ms,
        average_session_time_ms = EXCLUDED.average_session_time_ms,
        top_subjects = EXCLUDED.top_subjects,
        opted_into_leaderboard = EXCLUDED.opted_into_leaderboard`,
      [
        statId,
        userId,
        5, // current_streak - 5 day streak
        12, // longest_streak - best was 12 days
        lastStudyDate.toISOString().split("T")[0], // last_study_date
        23, // total_study_days - studied 23 different days
        342, // total_cards_reviewed
        87, // total_cards_mastered
        3, // active_decks_count
        45, // new_cards_this_week
        156, // new_cards_this_month
        4320000, // total_study_time_ms (72 minutes total)
        1200000, // average_session_time_ms (20 minutes per session)
        JSON.stringify([
          { subject: "JavaScript", count: 120 },
          { subject: "React", count: 95 },
          { subject: "Database Design", count: 127 },
        ]),
        false, // opted_into_leaderboard
      ],
    );

    console.log("✅ Sample statistics added successfully!");
    console.log("\nStatistics Summary:");
    console.log("  Current Streak: 5 days");
    console.log("  Longest Streak: 12 days");
    console.log("  Total Study Days: 23 days");
    console.log("  Cards Reviewed: 342");
    console.log("  Cards Mastered: 87");
    console.log("  Active Decks: 3");
    console.log("  Total Study Time: 72 minutes");
    console.log("  Top Subjects: JavaScript, React, Database Design");

    process.exitCode = 0;
  } catch (error) {
    console.error("❌ Error adding sample stats:", error);
    throw new Error(`Error adding sample stats: ${error.message}`, {
      cause: error,
    });
  }
}

addSampleStats();
